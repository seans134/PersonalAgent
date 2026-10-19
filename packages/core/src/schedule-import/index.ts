import { Calendar, shiftDate, type CalendarEvent, type ScheduleBlock, type ScheduleBlockCategory, type DayOfWeek } from "../calendar";

export const SCHEDULE_UPLOAD_BYTES = 4 * 1024 * 1024;
export type ScheduleImportEntry = {
  kind: "recurring" | "dated";
  title: string;
  category: ScheduleBlockCategory;
  timezone: string;
  date: string | null;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  endDayOffset: 0 | 1;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  ongoing: boolean;
  include: boolean;
  warnings: string[];
};
export type ScheduleImportDraft = { entries: ScheduleImportEntry[]; warnings: string[] };
const categories = new Set(["school", "work", "study", "personal", "unavailable"]);
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function scheduleEntryErrors(entry: ScheduleImportEntry): string[] {
  const errors: string[] = [];
  if (!entry.title.trim()) errors.push("Add a title.");
  if (!categories.has(entry.category)) errors.push("Choose a category.");
  if (!validTimezone(entry.timezone)) errors.push("Choose a valid timezone.");
  if (!clock.test(entry.startTime) || !clock.test(entry.endTime)) errors.push("Confirm start and end times (HH:MM).");
  else {
    const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const duration = minutes(entry.endTime) + entry.endDayOffset * 1440 - minutes(entry.startTime);
    if (duration <= 0 || duration > 1440) errors.push("Duration must be greater than zero and no longer than 24 hours.");
  }
  if (entry.kind === "dated" && !validDate(entry.date)) errors.push("Confirm the event date.");
  if (entry.kind === "recurring") {
    if (!entry.daysOfWeek.length || entry.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push("Choose weekdays.");
    if (!entry.ongoing && (!validDate(entry.effectiveFrom) || !validDate(entry.effectiveUntil))) errors.push("Confirm start/end dates, or explicitly choose Ongoing.");
    if (entry.effectiveFrom && !validDate(entry.effectiveFrom)) errors.push("Invalid start date.");
    if (entry.effectiveUntil && !validDate(entry.effectiveUntil)) errors.push("Invalid end date.");
    if (entry.effectiveFrom && entry.effectiveUntil && entry.effectiveUntil < entry.effectiveFrom) errors.push("End date must follow start date.");
  }
  return errors;
}
export function validateScheduleImport(value: unknown, strict = false): ScheduleImportDraft {
  if (!value || typeof value !== "object" || !Array.isArray((value as ScheduleImportDraft).entries)) throw new Error("Invalid schedule draft.");
  const raw = value as ScheduleImportDraft;
  if (raw.entries.length > 200) throw new Error("Import up to 200 schedule entries at a time.");
  const entries = raw.entries.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid schedule entry.");
    const entry: ScheduleImportEntry = {
      kind: item.kind === "dated" ? "dated" : "recurring",
      title: typeof item.title === "string" ? item.title.trim().slice(0, 200) : "",
      category: categories.has(item.category) ? item.category : "school",
      timezone: typeof item.timezone === "string" ? item.timezone.trim() : "",
      date: typeof item.date === "string" ? item.date : null,
      daysOfWeek: Array.isArray(item.daysOfWeek) ? [...new Set(item.daysOfWeek)].sort() : [],
      startTime: typeof item.startTime === "string" ? item.startTime : "",
      endTime: typeof item.endTime === "string" ? item.endTime : "",
      endDayOffset: item.endDayOffset === 1 ? 1 : 0,
      effectiveFrom: typeof item.effectiveFrom === "string" && item.effectiveFrom ? item.effectiveFrom : null,
      effectiveUntil: typeof item.effectiveUntil === "string" && item.effectiveUntil ? item.effectiveUntil : null,
      ongoing: item.ongoing === true,
      include: item.include !== false,
      warnings: Array.isArray(item.warnings) ? item.warnings.filter((w): w is string => typeof w === "string").slice(0, 20) : [],
    };
    if (entry.ongoing) entry.effectiveUntil = null;
    const errors = scheduleEntryErrors(entry);
    if (item.kind !== "dated" && item.kind !== "recurring") errors.push("Confirm whether this entry repeats weekly or has a specific date.");
    if (!categories.has(item.category)) errors.push("Confirm the category.");
    if (item.endDayOffset !== undefined && item.endDayOffset !== 0 && item.endDayOffset !== 1) errors.push("Confirm whether the entry ends the next day.");
    if (strict && entry.include && errors.length) throw new Error(`${entry.title || "Entry"}: ${errors.join(" ")}`);
    if (!strict && errors.length) { entry.include = false; entry.warnings = [...entry.warnings, ...errors]; }
    return entry;
  });
  return { entries, warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string").slice(0, 30) : [] };
}
export function emptyScheduleEntry(timezone: string): ScheduleImportEntry {
  return { kind: "recurring", title: "", category: "school", timezone, date: null, daysOfWeek: [], startTime: "", endTime: "", endDayOffset: 0, effectiveFrom: null, effectiveUntil: null, ongoing: false, include: false, warnings: [] };
}
export function scheduleDraftCalendar(draft: ScheduleImportDraft): Calendar {
  const calendar = new Calendar();
  draft.entries.forEach((entry, index) => {
    if (!entry.include || scheduleEntryErrors(entry).length) return;
    if (entry.kind === "recurring") calendar.addScheduleBlock({ ...entry, id: `draft-${index}`, effectiveUntil: entry.ongoing ? null : entry.effectiveUntil });
    else calendar.addEvent({ ...entry, date: entry.date!, id: `draft-${index}`, source: "manual" });
  });
  return calendar;
}
export function schedulePreview(draft: ScheduleImportDraft, from: string): Array<{ date: string; events: CalendarEvent[] }> {
  const calendar = scheduleDraftCalendar(draft);
  return Array.from({ length: 7 }, (_, i) => { const date = shiftDate(from, i); return { date, events: calendar.getEventsForDate(date) }; });
}

export type ScheduleImportApplied = { scheduleBlocksCreated: number; eventsCreated: number; skippedDuplicates: number };
export type ScheduleReviewIssue = { duplicate: boolean; overlap: boolean };
export function scheduleReviewIssues(draft: ScheduleImportDraft, snapshot: { scheduleBlocks: ScheduleBlock[]; events: CalendarEvent[]; timezone?: string }): ScheduleReviewIssue[] {
  const existing: ScheduleImportEntry[] = [
    ...snapshot.scheduleBlocks.map((b): ScheduleImportEntry => ({ ...emptyScheduleEntry(b.timezone || "America/Toronto"), ...b, kind: "recurring", effectiveFrom: b.effectiveFrom ?? null, effectiveUntil: b.effectiveUntil ?? null, endDayOffset: b.endDayOffset ?? 0, ongoing: !b.effectiveUntil, include: true })),
    ...snapshot.events.filter((e) => !e.course?.isDeadline).map((e): ScheduleImportEntry => ({ ...emptyScheduleEntry(e.timezone || snapshot.timezone || "America/Toronto"), ...e, timezone: e.timezone || snapshot.timezone || "America/Toronto", kind: "dated", endDayOffset: e.endDayOffset ?? 0, include: true })),
  ];
  const signature = (e: ScheduleImportEntry) => JSON.stringify([e.kind, e.title.trim().toLowerCase(), e.category, e.timezone, e.startTime, e.endTime, e.endDayOffset, e.kind === "dated" ? e.date : [...e.daysOfWeek].sort(), e.kind === "recurring" ? e.effectiveFrom : null, e.kind === "recurring" && !e.ongoing ? e.effectiveUntil : null]);
  const overlaps = (a: ScheduleImportEntry, b: ScheduleImportEntry) => {
    const start = [a.kind === "dated" ? a.date : a.effectiveFrom, b.kind === "dated" ? b.date : b.effectiveFrom].filter((d): d is string => !!d).sort().at(-1) || "2000-01-03";
    const calendar = scheduleDraftCalendar({ entries: [a, b], warnings: [] });
    return Array.from({ length: 9 }, (_, i) => shiftDate(start, i - 1)).some((d) => calendar.findConflicts(d).some((c) => c.firstEvent.sourceId !== c.secondEvent.sourceId || c.firstEvent.source === "manual" || c.secondEvent.source === "manual"));
  };
  return draft.entries.map((entry) => {
    if (!entry.include || scheduleEntryErrors(entry).length) return { duplicate: false, overlap: false };
    const duplicate = existing.some((e) => signature(e) === signature(entry));
    const overlap = !duplicate && existing.some((e) => overlaps(entry, e));
    if (!duplicate) existing.push(entry);
    return { duplicate, overlap };
  });
}
