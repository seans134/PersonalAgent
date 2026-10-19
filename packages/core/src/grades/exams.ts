import { shiftDate } from "../habits/metrics";

export type ExamCandidateItem = {
  id: string;
  title: string;
  kind: string;
  dueAt: string;
  scoreEarned: number | null;
};

export type NextExam = { id: string; title: string; dueAt: string };

// An upcoming exam with a display label, e.g. "CHEM 201 Midterm". courseId lets callers link back.
export type UpcomingExam = { id: string; courseId: string; label: string; dueAt: string };

export type ExamReminder = {
  examId: string;
  courseId: string;
  daysBefore: number;
  fireAt: string;
  title: string;
  body: string;
};

export type ExamReminderOptions = {
  // IANA zone for the reminder's wall-clock time. Omit to use the runtime's local time (the device on mobile).
  timeZone?: string;
  hour?: number;
  minute?: number;
  daysBefore?: number[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Soonest ungraded exam due strictly after `now`. Ties on due time fall back to title, then id,
// so the pick doesn't depend on row order.
export function nextUpcomingExam(items: ExamCandidateItem[], now: Date): NextExam | null {
  const nowMs = now.getTime();
  let best: { item: ExamCandidateItem; due: number } | null = null;
  for (const item of items) {
    if (item.kind !== "exam" || item.scoreEarned !== null) continue;
    const due = Date.parse(item.dueAt);
    if (!Number.isFinite(due) || due <= nowMs) continue;
    if (
      !best ||
      due < best.due ||
      (due === best.due && (item.title.localeCompare(best.item.title) || item.id.localeCompare(best.item.id)) < 0)
    ) {
      best = { item, due };
    }
  }
  return best ? { id: best.item.id, title: best.item.title, dueAt: best.item.dueAt } : null;
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

function partsIn(ms: number, timeZone?: string): DateParts {
  if (!timeZone) {
    const d = new Date(ms);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  }
  const map: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: map.hour === "24" ? 0 : Number(map.hour), minute: Number(map.minute),
  };
}

function dateKey(p: DateParts): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// The instant at which the wall clock in `timeZone` reads `key` hour:minute.
function wallTimeToMs(key: string, hour: number, minute: number, timeZone?: string): number {
  const [year, month, day] = key.split("-").map(Number);
  if (!timeZone) return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms: number) => {
    const p = partsIn(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
  };
  const first = guess - offsetAt(guess);
  const second = guess - offsetAt(first);
  return second;
}

// Calendar days from `now` to `dueAt` in the given zone: 0 = today, 1 = tomorrow.
export function calendarDaysUntil(dueAt: string, now: Date, timeZone?: string): number {
  const due = Date.parse(dueAt);
  const [y1, m1, d1] = dateKey(partsIn(now.getTime(), timeZone)).split("-").map(Number);
  const [y2, m2, d2] = dateKey(partsIn(due, timeZone)).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}

export function formatDaysAway(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

// Exams due after `now` and within `days` calendar days, soonest first, with their day count.
export function examsWithinDays<T extends { dueAt: string }>(
  exams: T[],
  now: Date,
  days: number,
  timeZone?: string,
): Array<T & { daysAway: number }> {
  const nowMs = now.getTime();
  return exams
    .filter((exam) => {
      const due = Date.parse(exam.dueAt);
      return Number.isFinite(due) && due > nowMs;
    })
    .map((exam) => ({ ...exam, daysAway: calendarDaysUntil(exam.dueAt, now, timeZone) }))
    .filter((exam) => exam.daysAway <= days)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

// Reminders N days before each exam at a fixed local time (9:00 by default). Reminders whose time
// has passed, or that would land at or after the exam itself, are skipped.
export function buildExamReminders(exams: UpcomingExam[], now: Date, options: ExamReminderOptions = {}): ExamReminder[] {
  const { timeZone, hour = 9, minute = 0, daysBefore = [3, 1] } = options;
  const nowMs = now.getTime();
  const reminders: ExamReminder[] = [];
  for (const exam of exams) {
    const due = Date.parse(exam.dueAt);
    if (!Number.isFinite(due) || due <= nowMs) continue;
    const dueKey = dateKey(partsIn(due, timeZone));
    for (const offset of daysBefore) {
      const fireMs = wallTimeToMs(shiftDate(dueKey, -offset), hour, minute, timeZone);
      if (fireMs <= nowMs || fireMs >= due) continue;
      reminders.push({
        examId: exam.id,
        courseId: exam.courseId,
        daysBefore: offset,
        fireAt: new Date(fireMs).toISOString(),
        title: offset === 1 ? `Exam tomorrow: ${exam.label}` : `Exam in ${offset} days: ${exam.label}`,
        body: "Open Atlas to plan your review.",
      });
    }
  }
  return reminders.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
}

// "CHEM 201 Midterm"; falls back to the course name when there's no code.
export function examLabel(course: { name: string; code: string | null }, examTitle: string): string {
  return `${course.code?.trim() || course.name} ${examTitle}`;
}
