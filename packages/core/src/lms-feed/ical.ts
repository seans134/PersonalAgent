// Minimal iCalendar (RFC 5545) reader for LMS calendar feeds (Canvas, Brightspace/D2L, Moodle,
// Blackboard). It keeps only what deadline import needs: UID, SUMMARY, LOCATION, CATEGORIES, URL,
// DTSTART/DTEND (VEVENT) or DUE (VTODO), STATUS, and whether the component recurs. Pure: no I/O,
// no time zone math (see resolveICalDate in deadlines.ts).

export type ICalDateValue =
  /** VALUE=DATE (all day). */
  | { kind: "date"; date: string }
  /** UTC date-time ("...Z"). */
  | { kind: "utc"; iso: string }
  /** Local date-time, in TZID when given, otherwise floating. */
  | { kind: "local"; date: string; time: string; tzid: string | null };

export type ICalEvent = {
  component: "VEVENT" | "VTODO";
  uid: string;
  summary: string;
  location: string | null;
  categories: string[];
  url: string | null;
  start: ICalDateValue | null;
  end: ICalDateValue | null;
  /** VTODO DUE. */
  due: ICalDateValue | null;
  /** STATUS, upper-cased (CANCELLED, CONFIRMED, ...). */
  status: string | null;
  /** Has RRULE or RDATE. */
  recurring: boolean;
  /** Overrides one instance of a recurring event (RECURRENCE-ID). */
  recurrenceOverride: boolean;
};

export type ICalParseResult = {
  /** The text has a BEGIN:VCALENDAR. */
  isCalendar: boolean;
  events: ICalEvent[];
  /** X-WR-TIMEZONE, the default zone for floating times. */
  calendarTimezone: string | null;
  /** More components than maxEvents; the rest were not read. */
  truncated: boolean;
};

export const ICAL_MAX_EVENTS = 5000;
/** Longest text value kept (SUMMARY, LOCATION, UID, ...). */
const MAX_TEXT = 500;

type ParsedLine = { name: string; params: Record<string, string>; value: string };

/** Joins folded lines (CRLF or LF followed by a space or tab) and splits into logical lines. */
export function unfoldICalLines(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r\n|\n|\r/);
}

/** Splits `value` on `separator` outside double quotes. */
function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function parseLine(line: string): ParsedLine | null {
  // The value starts after the first colon that isn't inside a quoted parameter value.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [rawName, ...rawParams] = splitOutsideQuotes(line.slice(0, colon), ";");
  const name = rawName.trim().toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq <= 0) continue;
    params[param.slice(0, eq).trim().toUpperCase()] = param.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return { name, params, value: line.slice(colon + 1) };
}

/** Unescapes a TEXT value (\n, \N, \,, \;, \\). */
export function unescapeICalText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

/** Splits a multi-value TEXT property (CATEGORIES) on unescaped commas. */
function splitICalList(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "\\" && i + 1 < value.length) {
      current += char + value[i + 1];
      i += 1;
    } else if (char === ",") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => cleanText(unescapeICalText(part))).filter(Boolean);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function validDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses a DATE or DATE-TIME value with its params; null when malformed. */
export function parseICalDate(value: string, params: Record<string, string> = {}): ICalDateValue | null {
  const raw = value.trim();
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  if (!validDate(Number(y), Number(mo), Number(d))) return null;
  const date = `${y}-${mo}-${d}`;
  if (h === undefined || params.VALUE?.toUpperCase() === "DATE") {
    return h === undefined ? { kind: "date", date } : null;
  }
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 60) return null;
  const time = `${h}:${mi}:${s === "60" ? "59" : s}`;
  if (z) return { kind: "utc", iso: `${date}T${time}.000Z` };
  return { kind: "local", date, time, tzid: params.TZID?.trim() || null };
}

type Draft = Omit<ICalEvent, "uid" | "summary"> & { uid: string | null; summary: string | null };

function emptyDraft(component: ICalEvent["component"]): Draft {
  return {
    component,
    uid: null,
    summary: null,
    location: null,
    categories: [],
    url: null,
    start: null,
    end: null,
    due: null,
    status: null,
    recurring: false,
    recurrenceOverride: false,
  };
}

/**
 * Reads VEVENT and VTODO components. Properties of nested components (VALARM) are ignored, and
 * components without a UID are skipped (re-sync needs a stable id). Reads at most maxEvents.
 */
export function parseICalendar(text: string, options: { maxEvents?: number } = {}): ICalParseResult {
  const maxEvents = options.maxEvents ?? ICAL_MAX_EVENTS;
  const events: ICalEvent[] = [];
  const stack: string[] = [];
  let isCalendar = false;
  let calendarTimezone: string | null = null;
  let draft: Draft | null = null;
  let truncated = false;

  for (const rawLine of unfoldICalLines(text)) {
    if (!rawLine.trim()) continue;
    const line = parseLine(rawLine);
    if (!line) continue;

    if (line.name === "BEGIN") {
      const component = line.value.trim().toUpperCase();
      if (component === "VCALENDAR") isCalendar = true;
      stack.push(component);
      if ((component === "VEVENT" || component === "VTODO") && stack.length === 2 && stack[0] === "VCALENDAR") {
        if (events.length >= maxEvents) {
          truncated = true;
          break;
        }
        draft = emptyDraft(component);
      }
      continue;
    }

    if (line.name === "END") {
      const component = stack.pop();
      if (draft && stack.length === 1 && (component === "VEVENT" || component === "VTODO")) {
        if (draft.uid) events.push({ ...draft, uid: draft.uid, summary: draft.summary ?? "" });
        draft = null;
      }
      continue;
    }

    if (stack.length === 1 && stack[0] === "VCALENDAR" && line.name === "X-WR-TIMEZONE") {
      calendarTimezone = cleanText(line.value) || null;
      continue;
    }

    // Only the event's own properties, not those of a nested VALARM.
    if (!draft || stack.length !== 2) continue;
    switch (line.name) {
      case "UID":
        draft.uid = cleanText(line.value) || null;
        break;
      case "SUMMARY":
        draft.summary = cleanText(unescapeICalText(line.value));
        break;
      case "LOCATION":
        draft.location = cleanText(unescapeICalText(line.value)) || null;
        break;
      case "CATEGORIES":
        draft.categories.push(...splitICalList(line.value));
        break;
      case "URL":
        draft.url = cleanText(line.value) || null;
        break;
      case "DTSTART":
        draft.start = parseICalDate(line.value, line.params);
        break;
      case "DTEND":
        draft.end = parseICalDate(line.value, line.params);
        break;
      case "DUE":
        draft.due = parseICalDate(line.value, line.params);
        break;
      case "STATUS":
        draft.status = line.value.trim().toUpperCase() || null;
        break;
      case "RRULE":
      case "RDATE":
        draft.recurring = true;
        break;
      case "RECURRENCE-ID":
        draft.recurrenceOverride = true;
        break;
    }
  }

  return { isCalendar, events, calendarTimezone, truncated };
}
