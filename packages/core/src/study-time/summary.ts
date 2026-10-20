import { shiftDate } from "../calendar";
import type { StudySession } from "./sessions";

// Study-time insights from saved sessions: minutes per course this week, the daily study
// streak, and the last 7 days of minutes. Days are the student's local dates (studyDate),
// so the server and both surfaces agree on which day a session counts toward.

/** The fields of a saved session the insights read. */
export type StudySessionLike = Pick<StudySession, "courseId" | "courseName" | "studyDate" | "durationMinutes">;

/** How many days back the summary reads sessions; also the longest streak it can report. */
export const STUDY_SUMMARY_LOOKBACK_DAYS = 90;

export type StudyCourseMinutes = { courseId: string | null; courseName: string | null; minutes: number };
export type StudyDayMinutes = { date: string; minutes: number };

/** GET /api/mobile/study-sessions/summary (?courseId= adds that course's all-time total). */
export type StudySummary = {
  /** The student's local today (profile timezone). */
  today: string;
  /** Monday of the current week. */
  weekStart: string;
  weekTotalMinutes: number;
  /** This week's minutes per course, most first; sessions without a course have courseId null. */
  weekByCourse: StudyCourseMinutes[];
  /** The 7 days ending today, oldest first. */
  last7Days: StudyDayMinutes[];
  /** Consecutive days with study, ending today (or yesterday while today has none yet). */
  streakDays: number;
  todayMinutes: number;
  running: StudySession | null;
  /** A timer this read stopped at the auto-stop limit, so clients can say so. */
  autoStopped: StudySession | null;
  /** Present when ?courseId= was asked for: every minute logged for that course. */
  courseTotalMinutes?: number;
};

function minutesOf(session: StudySessionLike): number {
  const minutes = Number(session.durationMinutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

/** Monday of the week `date` (YYYY-MM-DD) falls in. */
export function studyWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftDate(date, -((weekday + 6) % 7));
}

/** Total minutes per local date. Running sessions (no duration) count for nothing. */
export function studyMinutesByDate(sessions: StudySessionLike[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const minutes = minutesOf(session);
    if (minutes > 0) totals.set(session.studyDate, (totals.get(session.studyDate) ?? 0) + minutes);
  }
  return totals;
}

/** Minutes per course for sessions dated from..to (inclusive), most minutes first, then by name. */
export function studyMinutesByCourse(sessions: StudySessionLike[], from: string, to: string): StudyCourseMinutes[] {
  const totals = new Map<string, StudyCourseMinutes>();
  for (const session of sessions) {
    const minutes = minutesOf(session);
    if (minutes === 0 || session.studyDate < from || session.studyDate > to) continue;
    const key = session.courseId ?? "";
    const entry = totals.get(key) ?? { courseId: session.courseId, courseName: session.courseName, minutes: 0 };
    entry.minutes += minutes;
    entry.courseName = entry.courseName ?? session.courseName;
    totals.set(key, entry);
  }
  return [...totals.values()].sort(
    (a, b) => b.minutes - a.minutes || (a.courseName ?? "￿").localeCompare(b.courseName ?? "￿"),
  );
}

/** Minutes for each of the `days` days ending on `today`, oldest first (days with none read 0). */
export function studyMinutesForDays(sessions: StudySessionLike[], today: string, days = 7): StudyDayMinutes[] {
  const totals = studyMinutesByDate(sessions);
  const result: StudyDayMinutes[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    result.push({ date, minutes: totals.get(date) ?? 0 });
  }
  return result;
}

/**
 * Consecutive days with any study, ending today. A day without study yet doesn't break the
 * streak until it's over, so with nothing today the streak counts back from yesterday.
 */
export function studyStreakDays(sessions: StudySessionLike[], today: string, maxDays = STUDY_SUMMARY_LOOKBACK_DAYS): number {
  const totals = studyMinutesByDate(sessions);
  let day = (totals.get(today) ?? 0) > 0 ? today : shiftDate(today, -1);
  let streak = 0;
  while (streak < maxDays && (totals.get(day) ?? 0) > 0) {
    streak += 1;
    day = shiftDate(day, -1);
  }
  return streak;
}

/** Total minutes across sessions (e.g. one course's sessions for "4 h 20 min studied this term"). */
export function totalStudyMinutes(sessions: StudySessionLike[]): number {
  return sessions.reduce((total, session) => total + minutesOf(session), 0);
}

/** Builds the summary from saved sessions dated within the lookback window. */
export function buildStudySummary(
  sessions: StudySessionLike[],
  options: { today: string; running?: StudySession | null; autoStopped?: StudySession | null; courseTotalMinutes?: number },
): StudySummary {
  const { today } = options;
  const weekStart = studyWeekStart(today);
  const weekByCourse = studyMinutesByCourse(sessions, weekStart, today);
  const summary: StudySummary = {
    today,
    weekStart,
    weekTotalMinutes: weekByCourse.reduce((total, entry) => total + entry.minutes, 0),
    weekByCourse,
    last7Days: studyMinutesForDays(sessions, today, 7),
    streakDays: studyStreakDays(sessions, today),
    todayMinutes: studyMinutesByDate(sessions).get(today) ?? 0,
    running: options.running ?? null,
    autoStopped: options.autoStopped ?? null,
  };
  if (options.courseTotalMinutes !== undefined) summary.courseTotalMinutes = options.courseTotalMinutes;
  return summary;
}

/** Short weekday label for a YYYY-MM-DD date ("Mon"), independent of the device timezone. */
export function studyDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
