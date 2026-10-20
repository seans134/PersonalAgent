// Turns parsed LMS calendar events into course-item deadlines, matches them to the student's
// courses, and plans an idempotent re-sync against what earlier syncs stored (lms_feed_items).
// Pure; the API in src/lib/lms-feed/sync.ts reads and writes the rows.

import type { ICalDateValue, ICalEvent } from "./ical";

export type LmsDeadlineKind = "assignment" | "quiz" | "exam";

export type LmsDeadline = {
  uid: string;
  kind: LmsDeadlineKind;
  /** Display title with the course tag and LMS suffixes ("[CS 101]", " is due") removed. */
  title: string;
  dueAt: string;
  /** End of a timed exam or quiz window; null for plain deadlines. */
  endAt: string | null;
  /** The course text the LMS attached (Canvas "[CS 101]", CATEGORIES, location), for matching and display. */
  courseHint: string | null;
  /** Every course-like text on the event, best first (hints, then the raw summary). */
  matchTexts: string[];
};

export type LmsCourseRef = { id: string; name: string; code: string | null };

export type LmsFeedItemStatus = "imported" | "needs_course" | "skipped" | "removed";

/** A row of lms_feed_items: one LMS event (by UID) and what Atlas did with it. */
export type LmsFeedItemRecord = {
  id: string;
  uid: string;
  status: LmsFeedItemStatus;
  courseItemId: string | null;
  /** The course the event went to (auto-matched or chosen by the student). */
  courseId: string | null;
  // The event as the feed last described it.
  kind: LmsDeadlineKind;
  title: string;
  dueAt: string;
  endAt: string | null;
  courseHint: string | null;
};

/** Longest title stored on a course item. */
export const LMS_TITLE_MAX = 200;
/** New events due before now minus this are left out (old coursework from past weeks or terms). */
export const LMS_IMPORT_LOOKBACK_DAYS = 14;
/** New events due after now plus this are left out. */
export const LMS_IMPORT_LOOKAHEAD_DAYS = 366;
/** Deadlines handled per sync (soonest first after the window). */
export const LMS_MAX_DEADLINES = 1000;
/** Local time used for an all-day (date-only) deadline. */
export const LMS_ALL_DAY_DUE_TIME = "23:59";
/** A timed window longer than this isn't treated as an exam sitting. */
const MAX_WINDOW_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Time zones

const WINDOWS_ZONES: Record<string, string> = {
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "us mountain standard time": "America/Phoenix",
  "pacific standard time": "America/Los_Angeles",
  "alaskan standard time": "America/Anchorage",
  "hawaiian standard time": "Pacific/Honolulu",
  "atlantic standard time": "America/Halifax",
  "newfoundland standard time": "America/St_Johns",
  "gmt standard time": "Europe/London",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "aus eastern standard time": "Australia/Sydney",
  "new zealand standard time": "Pacific/Auckland",
  utc: "UTC",
};

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Maps a TZID (IANA, "/prefixed/America/New_York", or a Windows name) to an IANA zone, or null. */
export function resolveTimeZoneId(tzid: string | null): string | null {
  if (!tzid) return null;
  const trimmed = tzid.trim().replace(/^"|"$/g, "");
  if (!trimmed) return null;
  if (isTimeZone(trimmed)) return trimmed;
  const windows = WINDOWS_ZONES[trimmed.toLowerCase()];
  if (windows) return windows;
  // "/mozilla.org/20050126_1/America/New_York" and similar prefixes: try shorter suffixes.
  const parts = trimmed.split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i += 1) {
    const candidate = parts.slice(i).join("/");
    if (candidate.includes("/") && isTimeZone(candidate)) return candidate;
  }
  return null;
}

/** Offset of `timeZone` from UTC at `utcMs`, in ms. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** A wall-clock time in `timeZone` as a UTC ISO string. Times skipped by a DST jump move forward. */
export function zonedTimeToIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = wall - zoneOffsetMs(wall, timeZone);
  const second = wall - zoneOffsetMs(first, timeZone);
  return new Date(second).toISOString();
}

/**
 * An iCal date as a UTC ISO string. All-day dates become LMS_ALL_DAY_DUE_TIME in the student's
 * zone; floating times use the calendar's X-WR-TIMEZONE, then the student's zone.
 */
export function resolveICalDate(
  value: ICalDateValue,
  zones: { student: string; calendar?: string | null },
  allDayTime: string = LMS_ALL_DAY_DUE_TIME,
): string {
  const fallback = resolveTimeZoneId(zones.calendar ?? null) ?? resolveTimeZoneId(zones.student) ?? "UTC";
  if (value.kind === "utc") return value.iso;
  if (value.kind === "date") return zonedTimeToIso(value.date, allDayTime, resolveTimeZoneId(zones.student) ?? "UTC");
  return zonedTimeToIso(value.date, value.time, resolveTimeZoneId(value.tzid) ?? fallback);
}

// ---------------------------------------------------------------------------------------------
// Classifying events

// Availability and reminder entries that aren't deadlines ("Quiz 1 opens", "Availability Starts").
const NOT_A_DEADLINE = /\b(opens|availability starts|start date|starts|begins|office hours?|lecture|tutorial|recitation|review session|class meeting|reminder)\b/i;
// Exam wording. "Final" and "test" alone are too loose ("Final grades posted", "Test your setup"), so
// they only count as a numbered or unit test ("Test 2", "Unit 3 Test") or as the whole title ("Final").
const EXAM =
  /\b(exams?|midterms?|mid-terms?|term tests?|finals)\b|\btests?\s*#?\d+\b|\b(unit|chapter|module)\s+\d+\s+test\b|^\s*(the\s+)?(final|test)\s*$/i;
const QUIZ = /\b(quiz|quizzes)\b/i;
// "Final project" and "final paper" are assignments, not exams.
const FINAL_COURSEWORK = /\bfinal\s+(project|paper|essay|report|presentation|portfolio|submission|draft|lab)\b/i;
const DEADLINE = /\b(due|deadline|assignment|homework|hw\s*\d*|problem set|pset|project|lab|essay|paper|report|submission|submit|closes|availability ends|ends|presentation|worksheet|reflection|discussion|reading response|portfolio)\b/i;

/** Canvas assignment events (graded work) have UIDs like "event-assignment-123". */
function isCanvasAssignment(uid: string): boolean {
  return /^event-assignment-/i.test(uid);
}

/** Kind from title wording (same synonyms as syllabus import); assignment by default. */
export function lmsDeadlineKind(title: string): LmsDeadlineKind {
  if (QUIZ.test(title)) return "quiz";
  if (EXAM.test(title) && !FINAL_COURSEWORK.test(title)) return "exam";
  return "assignment";
}

/**
 * Whether the event is a deadline worth importing. Canvas assignment events always are; other
 * events need exam/quiz/deadline wording and no "opens"/"lecture"-style wording. Recurring events
 * (classes, office hours), cancelled events, and recurrence overrides are never deadlines.
 */
export function isLmsDeadlineEvent(event: Pick<ICalEvent, "uid" | "summary" | "status" | "recurring" | "recurrenceOverride">): boolean {
  if (event.status === "CANCELLED" || event.recurring || event.recurrenceOverride) return false;
  if (!event.summary.trim()) return false;
  if (isCanvasAssignment(event.uid)) return true;
  if (NOT_A_DEADLINE.test(event.summary)) return false;
  // Without the "[COURSE]" tag, so a bare "Final [CHEM 201]" still reads as the whole title.
  const title = splitCourseTag(event.summary).title;
  return EXAM.test(title) || QUIZ.test(title) || DEADLINE.test(title);
}

/** Splits Canvas's trailing "[COURSE]" tag off a summary. */
export function splitCourseTag(summary: string): { title: string; tag: string | null } {
  const match = /^(.*?)\s*\[([^[\]]+)\]\s*$/.exec(summary);
  if (!match || !match[1].trim()) return { title: summary.trim(), tag: null };
  return { title: match[1].trim(), tag: match[2].trim() || null };
}

/** Drops LMS boilerplate from a title ("Essay 1 is due" -> "Essay 1", "Quiz 2 - Availability Ends" -> "Quiz 2"). */
export function cleanLmsTitle(title: string): string {
  const cleaned = title
    .replace(/\s+[-–—:]\s+(due|due date|availability ends|end date|closes)\.?$/i, "")
    .replace(/\s+(is due|is due now|closes|ends)\.?$/i, "")
    .trim();
  return (cleaned || title.trim()).slice(0, LMS_TITLE_MAX);
}

/**
 * The deadline for an event, or null when it isn't one or has no usable date. VEVENT uses DTSTART
 * (Canvas puts the due time there); VTODO uses DUE.
 */
export function lmsDeadlineFromEvent(event: ICalEvent, zones: { student: string; calendar?: string | null }): LmsDeadline | null {
  if (!isLmsDeadlineEvent(event)) return null;
  const startValue = event.component === "VTODO" ? event.due ?? event.start : event.start;
  if (!startValue) return null;
  let dueAt: string;
  try {
    dueAt = resolveICalDate(startValue, zones);
  } catch {
    return null;
  }

  const { title: untagged, tag } = splitCourseTag(event.summary);
  const title = cleanLmsTitle(untagged);
  const kind = lmsDeadlineKind(title);

  let endAt: string | null = null;
  if (kind !== "assignment" && event.end && startValue.kind !== "date" && event.end.kind !== "date") {
    try {
      const end = resolveICalDate(event.end, zones);
      const length = new Date(end).getTime() - new Date(dueAt).getTime();
      if (length > 0 && length <= MAX_WINDOW_MS) endAt = end;
    } catch {
      endAt = null;
    }
  }

  const hints = [tag, ...event.categories, event.location].filter((value): value is string => Boolean(value && value.trim()));
  return {
    uid: event.uid,
    kind,
    title,
    dueAt,
    endAt,
    courseHint: hints[0]?.slice(0, LMS_TITLE_MAX) ?? null,
    matchTexts: [...hints, event.summary],
  };
}

// ---------------------------------------------------------------------------------------------
// Matching to courses

/** Lower-case runs of letters or digits: "CS-101-001" -> ["cs","101","001"], "CHEM201" -> ["chem","201"]. */
export function courseTokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
}

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Normalized form of a course hint, the key for hints the student has already assigned. */
export function normalizeCourseHint(hint: string): string {
  return courseTokens(hint).join(" ");
}

// A course name this short ("Art", "Lab") matches too much text to trust on its own.
function nameIsSpecific(tokens: string[]): boolean {
  return tokens.length >= 2 || (tokens[0]?.length ?? 0) >= 5;
}

function uniqueId(ids: string[]): string | null {
  const unique = Array.from(new Set(ids));
  return unique.length === 1 ? unique[0] : null;
}

/**
 * The course an event belongs to, or null when there's no single match. In order: a hint the
 * student already assigned to a course, the course code in a hint, the course name in a hint, then
 * the course code in the raw summary. A step with more than one match stops (ambiguous -> null),
 * except that a longer code beats a shorter one ("CS 1010" over "CS 1").
 */
export function matchLmsCourse(
  deadline: Pick<LmsDeadline, "courseHint" | "matchTexts">,
  courses: readonly LmsCourseRef[],
  learnedHints: ReadonlyMap<string, string> = new Map(),
): string | null {
  if (deadline.courseHint) {
    const learned = learnedHints.get(normalizeCourseHint(deadline.courseHint));
    if (learned && courses.some((course) => course.id === learned)) return learned;
  }

  const hintTexts = deadline.matchTexts.slice(0, -1).map(courseTokens);
  const summaryTokens = courseTokens(deadline.matchTexts[deadline.matchTexts.length - 1] ?? "");
  const coded = courses
    .map((course) => ({ id: course.id, tokens: courseTokens(course.code ?? "") }))
    .filter((course) => course.tokens.length > 0);
  const named = courses
    .map((course) => ({ id: course.id, tokens: courseTokens(course.name) }))
    .filter((course) => nameIsSpecific(course.tokens));

  const byCode = (texts: string[][]) => {
    const hits = coded.filter((course) => texts.some((text) => containsRun(text, course.tokens)));
    if (hits.length <= 1) return hits.length === 1 ? hits[0].id : null;
    // Prefer the most specific code when one code contains another.
    const longest = Math.max(...hits.map((hit) => hit.tokens.join(" ").length));
    return uniqueId(hits.filter((hit) => hit.tokens.join(" ").length === longest).map((hit) => hit.id)) ?? "ambiguous";
  };

  const hintCode = byCode(hintTexts);
  if (hintCode) return hintCode === "ambiguous" ? null : hintCode;

  const nameHits = named.filter((course) => hintTexts.some((text) => containsRun(text, course.tokens)));
  if (nameHits.length > 0) return uniqueId(nameHits.map((hit) => hit.id));

  const summaryCode = byCode([summaryTokens]);
  return summaryCode && summaryCode !== "ambiguous" ? summaryCode : null;
}

/** Hints the student (or an earlier match) tied to a course, so later events with that tag follow. */
export function learnedCourseHints(records: readonly LmsFeedItemRecord[], courses: readonly LmsCourseRef[]): Map<string, string> {
  const active = new Set(courses.map((course) => course.id));
  const seen = new Map<string, string | null>();
  for (const record of records) {
    if (!record.courseHint || !record.courseId || !active.has(record.courseId)) continue;
    const key = normalizeCourseHint(record.courseHint);
    if (!key) continue;
    const existing = seen.get(key);
    if (existing === undefined) seen.set(key, record.courseId);
    else if (existing !== record.courseId) seen.set(key, null);
  }
  const learned = new Map<string, string>();
  for (const [key, courseId] of seen) if (courseId) learned.set(key, courseId);
  return learned;
}

// ---------------------------------------------------------------------------------------------
// Planning a sync

export type LmsFeedSyncCounts = {
  /** Events in the feed. */
  events: number;
  /** Events that are deadlines (assignments, quizzes, exams), in or out of the import window. */
  deadlines: number;
  /** Course items created this sync. */
  added: number;
  /** Course items whose date or title the feed changed this sync. */
  updated: number;
  /** Deadlines waiting for the student to pick a course (after this sync). */
  needsCourse: number;
};

/** Fields to write on a course item (snake_case column names). */
export type LmsCourseItemPatch = { title?: string; due_at?: string; end_at?: string | null };

export type LmsFeedSyncPlan = {
  /** New course items. recordId is set when an existing needs_course row is being matched. */
  create: Array<{ deadline: LmsDeadline; courseId: string; recordId: string | null }>;
  /** Course items to change because the feed changed them. */
  updateItems: Array<{ recordId: string; courseItemId: string; patch: LmsCourseItemPatch }>;
  /** Rows to refresh with the feed's latest values (status unchanged). */
  refresh: Array<{ recordId: string; deadline: LmsDeadline }>;
  /** New events with no course match. */
  addNeedsCourse: LmsDeadline[];
  /** Imported rows whose course item the student deleted. */
  markRemoved: string[];
  /** needs_course rows that left the feed or the import window. */
  dropNeedsCourse: string[];
  counts: LmsFeedSyncCounts;
};

function inWindow(dueAt: string, now: Date): boolean {
  const due = new Date(dueAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  return due >= now.getTime() - LMS_IMPORT_LOOKBACK_DAYS * day && due <= now.getTime() + LMS_IMPORT_LOOKAHEAD_DAYS * day;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

function feedChanged(record: LmsFeedItemRecord, deadline: LmsDeadline): boolean {
  return (
    record.title !== deadline.title ||
    record.kind !== deadline.kind ||
    record.courseHint !== deadline.courseHint ||
    !sameInstant(record.dueAt, deadline.dueAt) ||
    !sameInstant(record.endAt, deadline.endAt)
  );
}

/**
 * Compares this fetch with the stored rows. Re-running it on the same feed changes nothing:
 * - New UID: create a course item when it matches a course, otherwise wait as needs_course.
 * - Imported: when the feed's date or title changed since the last sync, update the course item
 *   (edits the student made in Atlas stay until the LMS changes that field again).
 * - Imported whose item was deleted (courseItemId null): marked removed, never re-created. This
 *   includes deleting the whole course (its items cascade): re-adding the course later does not
 *   bring those deadlines back; the student re-imports them by hand if they want them.
 * - Skipped / removed: only the stored feed values are refreshed.
 * - needs_course: matched now (e.g. the course was added since) -> created; gone -> dropped.
 * Events that disappear from the feed leave existing course items alone.
 */
export function planLmsFeedSync(input: {
  deadlines: readonly LmsDeadline[];
  records: readonly LmsFeedItemRecord[];
  courses: readonly LmsCourseRef[];
  now: Date;
  eventCount?: number;
}): LmsFeedSyncPlan {
  const { courses, now } = input;
  const plan: LmsFeedSyncPlan = {
    create: [],
    updateItems: [],
    refresh: [],
    addNeedsCourse: [],
    markRemoved: [],
    dropNeedsCourse: [],
    counts: { events: input.eventCount ?? input.deadlines.length, deadlines: input.deadlines.length, added: 0, updated: 0, needsCourse: 0 },
  };
  const learned = learnedCourseHints(input.records, courses);
  const recordByUid = new Map(input.records.map((record) => [record.uid, record] as const));

  // Last occurrence of a UID wins; deadlines are then handled soonest first, capped.
  const byUid = new Map<string, LmsDeadline>();
  for (const deadline of input.deadlines) byUid.set(deadline.uid, deadline);
  const deadlines = Array.from(byUid.values())
    .filter((deadline) => recordByUid.has(deadline.uid) || inWindow(deadline.dueAt, now))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, LMS_MAX_DEADLINES);
  const inFeed = new Set(deadlines.map((deadline) => deadline.uid));

  for (const deadline of deadlines) {
    const record = recordByUid.get(deadline.uid);
    if (!record) {
      const courseId = matchLmsCourse(deadline, courses, learned);
      if (courseId) plan.create.push({ deadline, courseId, recordId: null });
      else plan.addNeedsCourse.push(deadline);
      continue;
    }

    const changed = feedChanged(record, deadline);
    if (record.status === "imported" && !record.courseItemId) {
      plan.markRemoved.push(record.id);
      if (changed) plan.refresh.push({ recordId: record.id, deadline });
      continue;
    }

    if (record.status === "imported" && record.courseItemId) {
      if (!changed) continue;
      const patch: LmsCourseItemPatch = {};
      if (record.title !== deadline.title) patch.title = deadline.title;
      if (!sameInstant(record.dueAt, deadline.dueAt)) patch.due_at = deadline.dueAt;
      if (!sameInstant(record.endAt, deadline.endAt) || patch.due_at) patch.end_at = deadline.endAt;
      if (Object.keys(patch).length > 0) {
        plan.updateItems.push({ recordId: record.id, courseItemId: record.courseItemId, patch });
      }
      plan.refresh.push({ recordId: record.id, deadline });
      continue;
    }

    if (record.status === "needs_course") {
      if (!inWindow(deadline.dueAt, now)) {
        plan.dropNeedsCourse.push(record.id);
        continue;
      }
      const courseId = matchLmsCourse(deadline, courses, learned);
      if (courseId) {
        plan.create.push({ deadline, courseId, recordId: record.id });
        continue;
      }
      if (changed) plan.refresh.push({ recordId: record.id, deadline });
      continue;
    }

    // skipped / removed: keep the decision, remember the latest feed values.
    if (changed) plan.refresh.push({ recordId: record.id, deadline });
  }

  for (const record of input.records) {
    if (record.status === "needs_course" && !inFeed.has(record.uid)) plan.dropNeedsCourse.push(record.id);
    // Imported rows not in this feed whose item is gone are still marked removed.
    if (record.status === "imported" && !record.courseItemId && !inFeed.has(record.uid)) plan.markRemoved.push(record.id);
  }

  const promoted = new Set(plan.create.map((entry) => entry.recordId).filter(Boolean));
  const dropped = new Set(plan.dropNeedsCourse);
  const stillWaiting = input.records.filter(
    (record) => record.status === "needs_course" && !promoted.has(record.id) && !dropped.has(record.id),
  ).length;
  plan.counts.added = plan.create.length;
  plan.counts.updated = plan.updateItems.length;
  plan.counts.needsCourse = stillWaiting + plan.addNeedsCourse.length;
  return plan;
}

/** Parsed events -> deadlines, skipping non-deadlines and undated events. */
export function lmsDeadlinesFromEvents(
  events: readonly ICalEvent[],
  zones: { student: string; calendar?: string | null },
): LmsDeadline[] {
  const deadlines: LmsDeadline[] = [];
  for (const event of events) {
    const deadline = lmsDeadlineFromEvent(event, zones);
    if (deadline) deadlines.push(deadline);
  }
  return deadlines;
}
