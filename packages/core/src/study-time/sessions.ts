import { isPlanDate, isPlanItemKey, studyItemIdFromKey } from "../planner/checkoff";

// Study sessions: time a student spent studying, from the study timer or logged by hand.
// The server is the source of truth for a running timer's start time; clients only render
// the elapsed time. Shared by /api/mobile/study-sessions/* and both surfaces.

export const STUDY_SESSION_SOURCES = ["timer", "manual"] as const;
export type StudySessionSource = (typeof STUDY_SESSION_SOURCES)[number];

/** A stopped session shorter than this is discarded rather than saved. */
export const STUDY_SESSION_MIN_MINUTES = 1;
/** Upper bound for one saved session (matches the study_sessions.duration_minutes check). */
export const STUDY_SESSION_MAX_MINUTES = 720;
/** A timer left running longer than this is stopped at this length the next time it's read. */
export const STUDY_SESSION_AUTO_STOP_MINUTES = 6 * 60;
/** How far back a manual entry can be dated. */
export const STUDY_MANUAL_LOOKBACK_DAYS = 30;

export type StudySession = {
  id: string;
  courseId: string | null;
  /** The course's name, for the timer bar and lists; null when the session has no course. */
  courseName: string | null;
  courseItemId: string | null;
  startedAt: string;
  /** Null while the timer is running. */
  endedAt: string | null;
  durationMinutes: number | null;
  source: StudySessionSource;
  /** The student's local date the session counts toward. */
  studyDate: string;
  /** Set when the timer was started from a Today study block (its check-off key and plan date). */
  planItemKey: string | null;
  planDate: string | null;
  /** True when the timer ran past the auto-stop limit and was capped. */
  autoStopped: boolean;
};

// ---- /api/mobile/study-sessions/* contract ----

/** GET /api/mobile/study-sessions/current. autoStopped: a timer this read capped at the auto-stop limit. */
export type StudySessionCurrentResponse = {
  running: StudySession | null;
  autoStopped: StudySession | null;
};

/**
 * POST /api/mobile/study-sessions. Every field is optional: no course is a general session.
 * From a Today study block send planItemKey and planDate; the course item comes from the key.
 */
export type StudySessionStartRequest = {
  courseId?: string | null;
  courseItemId?: string | null;
  planItemKey?: string | null;
  planDate?: string | null;
};

export type StudySessionStartResponse = { session: StudySession };

/** POST /api/mobile/study-sessions/:id/stop. A session under a minute is discarded (session null). */
export type StudySessionStopResponse = { session: StudySession | null; discarded: boolean };

/** POST /api/mobile/study-sessions/manual: time studied away from the timer. */
export type StudySessionManualRequest = {
  courseId?: string | null;
  date: string;
  minutes: number;
};

export type StudySessionManualResponse = { session: StudySession };

// ---- time math ----

/** Whole minutes between two instants (floored; 0 when end is before start or either is invalid). */
export function studySessionMinutes(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 60_000);
}

/** Whether a running timer started at startedAt has passed the auto-stop limit. */
export function isStudySessionOverdue(startedAt: string, now: Date = new Date()): boolean {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) && now.getTime() - start > STUDY_SESSION_AUTO_STOP_MINUTES * 60_000;
}

/**
 * Where a timer stopped at `now` ends: now, or the auto-stop limit when the timer ran past it.
 * minutes is the length to save; under STUDY_SESSION_MIN_MINUTES the session should be discarded.
 */
export function studySessionStop(startedAt: string, now: Date = new Date()): { endedAt: string; minutes: number; autoStopped: boolean } {
  if (isStudySessionOverdue(startedAt, now)) {
    const endedAt = new Date(Date.parse(startedAt) + STUDY_SESSION_AUTO_STOP_MINUTES * 60_000).toISOString();
    return { endedAt, minutes: STUDY_SESSION_AUTO_STOP_MINUTES, autoStopped: true };
  }
  const endedAt = now.toISOString();
  return { endedAt, minutes: studySessionMinutes(startedAt, endedAt), autoStopped: false };
}

/** Milliseconds a running timer has been going (never negative, so a fast device clock reads 0:00). */
export function studyTimerElapsedMs(startedAt: string, now: number = Date.now()): number {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? Math.max(0, now - start) : 0;
}

/** A running timer's clock: "4:05", "12:30", "1:02:09". */
export function formatStudyTimer(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Analytics bucket for a saved session's length (enum, never the exact minutes). */
export type StudyMinutesBucket = "<15" | "15-30" | "30-60" | "60+";

export function studyMinutesBucket(minutes: number): StudyMinutesBucket {
  if (minutes < 15) return "<15";
  if (minutes < 30) return "15-30";
  if (minutes < 60) return "30-60";
  return "60+";
}

// ---- request parsing ----

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStudyId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionalId(value: unknown, label: string): ParseResult<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return isStudyId(value) ? { ok: true, value } : { ok: false, error: `${label} must be an id.` };
}

/** The validated start request; courseItemId already filled in from a study block's key. */
export type ParsedStudySessionStart = {
  courseId: string | null;
  courseItemId: string | null;
  planItemKey: string | null;
  planDate: string | null;
};

export function parseStudySessionStartRequest(body: unknown): ParseResult<ParsedStudySessionStart> {
  const record = asRecord(body ?? {});
  if (!record) return { ok: false, error: "Request body must be an object." };
  const courseId = optionalId(record.courseId, "courseId");
  if (!courseId.ok) return courseId;
  const courseItemId = optionalId(record.courseItemId, "courseItemId");
  if (!courseItemId.ok) return courseItemId;

  const rawKey = record.planItemKey ?? null;
  const rawDate = record.planDate ?? null;
  if ((rawKey === null) !== (rawDate === null)) {
    return { ok: false, error: "planItemKey and planDate go together." };
  }
  let planItemKey: string | null = null;
  let planDate: string | null = null;
  let itemId = courseItemId.value;
  if (rawKey !== null) {
    if (!isPlanItemKey(rawKey)) return { ok: false, error: "planItemKey is not a plan item key." };
    if (!isPlanDate(rawDate)) return { ok: false, error: "planDate must be a YYYY-MM-DD date." };
    const keyItemId = studyItemIdFromKey(rawKey);
    if (!keyItemId || !isStudyId(keyItemId)) return { ok: false, error: "Only a study block can start a timer." };
    if (itemId && itemId !== keyItemId) return { ok: false, error: "courseItemId doesn't match the study block." };
    itemId = keyItemId;
    planItemKey = rawKey;
    planDate = rawDate;
  }
  return { ok: true, value: { courseId: courseId.value, courseItemId: itemId, planItemKey, planDate } };
}

export type ParsedStudySessionManual = { courseId: string | null; date: string; minutes: number };

/** Validates the shape; the route checks the date against the student's today (not future, within the lookback). */
export function parseStudySessionManualRequest(body: unknown): ParseResult<ParsedStudySessionManual> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Request body must be an object." };
  const courseId = optionalId(record.courseId, "courseId");
  if (!courseId.ok) return courseId;
  if (!isPlanDate(record.date)) return { ok: false, error: "date must be a YYYY-MM-DD date." };
  const minutes = record.minutes;
  if (
    typeof minutes !== "number" ||
    !Number.isInteger(minutes) ||
    minutes < STUDY_SESSION_MIN_MINUTES ||
    minutes > STUDY_SESSION_MAX_MINUTES
  ) {
    return {
      ok: false,
      error: `minutes must be a whole number from ${STUDY_SESSION_MIN_MINUTES} to ${STUDY_SESSION_MAX_MINUTES}.`,
    };
  }
  return { ok: true, value: { courseId: courseId.value, date: record.date, minutes } };
}

/** Parses the minutes a student typed ("45", " 90 ") for manual entry; null when not a valid length. */
export function parseStudyMinutesInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= STUDY_SESSION_MIN_MINUTES && minutes <= STUDY_SESSION_MAX_MINUTES ? minutes : null;
}
