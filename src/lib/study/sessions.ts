import { NextResponse } from "next/server";
import { dateInTimezone, shiftDate } from "@personal-agent/core/calendar";
import { isPlanDateInWindow } from "@personal-agent/core/planner";
import {
  buildStudySummary,
  isStudySessionOverdue,
  STUDY_MANUAL_LOOKBACK_DAYS,
  STUDY_SESSION_MIN_MINUTES,
  STUDY_SUMMARY_LOOKBACK_DAYS,
  studySessionStop,
  totalStudyMinutes,
  type ParsedStudySessionManual,
  type ParsedStudySessionStart,
  type StudySession,
  type StudySessionCurrentResponse,
  type StudySessionSource,
  type StudySessionStopResponse,
  type StudySummary,
} from "@personal-agent/core/study-time";
import { profileTimezoneForUser } from "@/lib/planner/checkoff-store";
import type { createClient } from "@/lib/supabase/server";

// Study sessions for /api/mobile/study-sessions/* (web uses the same routes with cookie auth).
// Math and limits live in packages/core/src/study-time; this file reads and writes rows.

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type SessionRow = {
  id: string;
  course_id: string | null;
  course_item_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  source: StudySessionSource;
  study_date: string;
  plan_item_key: string | null;
  plan_date: string | null;
  auto_stopped: boolean | null;
};

const SESSION_COLUMNS =
  "id, course_id, course_item_id, started_at, ended_at, duration_minutes, source, study_date, plan_item_key, plan_date, auto_stopped";

/** A request the student can fix (or a missing row); routes answer with this status and message. */
export class StudySessionError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly running: StudySession | null = null,
  ) {
    super(message);
  }
}

function toSession(row: SessionRow, courseName: string | null): StudySession {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName,
    courseItemId: row.course_item_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    source: row.source,
    studyDate: row.study_date,
    planItemKey: row.plan_item_key,
    planDate: row.plan_date,
    autoStopped: Boolean(row.auto_stopped),
  };
}

/** The student's local today; an unknown saved timezone falls back to the planner default. */
async function todayForUser(supabase: SupabaseClient, userId: string, now: Date): Promise<string> {
  const timezone = await profileTimezoneForUser(supabase, userId);
  try {
    return dateInTimezone(now, timezone);
  } catch {
    return dateInTimezone(now, "America/Toronto");
  }
}

async function courseName(supabase: SupabaseClient, userId: string, courseId: string | null): Promise<string | null> {
  if (!courseId) return null;
  const { data, error } = await supabase.from("courses").select("name").eq("user_id", userId).eq("id", courseId).maybeSingle();
  if (error) throw new Error(`Unable to load course: ${error.message}`);
  return (data as { name: string } | null)?.name ?? null;
}

async function withCourseName(supabase: SupabaseClient, userId: string, row: SessionRow): Promise<StudySession> {
  return toSession(row, await courseName(supabase, userId, row.course_id));
}

/**
 * The running timer, if any. A timer left past the auto-stop limit is stopped at the limit and
 * marked here, the next time anything reads it, and comes back as autoStopped.
 */
export async function readCurrentStudySession(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<StudySessionCurrentResponse> {
  const { data, error } = await supabase
    .from("study_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load study timer: ${error.message}`);
  const row = data as SessionRow | null;
  if (!row) return { running: null, autoStopped: null };
  if (!isStudySessionOverdue(row.started_at, now)) {
    return { running: await withCourseName(supabase, userId, row), autoStopped: null };
  }

  const stop = studySessionStop(row.started_at, now);
  const { data: updated, error: updateError } = await supabase
    .from("study_sessions")
    .update({ ended_at: stop.endedAt, duration_minutes: stop.minutes, auto_stopped: true })
    .eq("user_id", userId)
    .eq("id", row.id)
    .is("ended_at", null)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (updateError) throw new Error(`Unable to stop study timer: ${updateError.message}`);
  // Another request may have stopped it first; either way nothing is running now.
  const stopped = updated as SessionRow | null;
  return { running: null, autoStopped: stopped ? await withCourseName(supabase, userId, stopped) : null };
}

/** Resolves and checks the course (and item) a session is for; the item decides the course. */
async function resolveCourse(
  supabase: SupabaseClient,
  userId: string,
  courseId: string | null,
  courseItemId: string | null,
): Promise<{ courseId: string | null; courseName: string | null }> {
  let resolvedCourseId = courseId;
  if (courseItemId) {
    const { data, error } = await supabase
      .from("course_items")
      .select("course_id")
      .eq("user_id", userId)
      .eq("id", courseItemId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load course item: ${error.message}`);
    const itemCourseId = (data as { course_id: string } | null)?.course_id;
    if (!itemCourseId) throw new StudySessionError(404, "That course item wasn't found.");
    if (courseId && courseId !== itemCourseId) throw new StudySessionError(400, "That item belongs to a different course.");
    resolvedCourseId = itemCourseId;
  }
  if (!resolvedCourseId) return { courseId: null, courseName: null };
  const name = await courseName(supabase, userId, resolvedCourseId);
  if (name === null) throw new StudySessionError(404, "That course wasn't found.");
  return { courseId: resolvedCourseId, courseName: name };
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function startStudySession(
  supabase: SupabaseClient,
  userId: string,
  input: ParsedStudySessionStart,
  now: Date = new Date(),
): Promise<StudySession> {
  const current = await readCurrentStudySession(supabase, userId, now);
  if (current.running) throw new StudySessionError(409, "A study timer is already running.", current.running);

  const today = await todayForUser(supabase, userId, now);
  if (input.planDate && !isPlanDateInWindow(input.planDate, today)) {
    throw new StudySessionError(400, "That plan is from another day. Plan your day again first.");
  }
  const course = await resolveCourse(supabase, userId, input.courseId, input.courseItemId);

  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      course_id: course.courseId,
      course_item_id: input.courseItemId,
      started_at: now.toISOString(),
      source: "timer",
      study_date: today,
      plan_item_key: input.planItemKey,
      plan_date: input.planDate,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (isUniqueViolation(error)) {
    // Two starts raced; the other one won.
    const winner = await readCurrentStudySession(supabase, userId, now);
    throw new StudySessionError(409, "A study timer is already running.", winner.running);
  }
  if (error || !data) throw new Error(`Unable to start study timer: ${error?.message ?? "no row returned"}`);
  return toSession(data as SessionRow, course.courseName);
}

/**
 * Stops a running timer: saved at its whole minutes (capped at the auto-stop limit), or deleted
 * when under a minute. Stopping a session that already stopped returns it unchanged.
 */
export async function stopStudySession(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<StudySessionStopResponse> {
  const { data, error } = await supabase
    .from("study_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load study session: ${error.message}`);
  const row = data as SessionRow | null;
  if (!row) throw new StudySessionError(404, "That study session wasn't found.");
  if (row.ended_at) return { session: await withCourseName(supabase, userId, row), discarded: false };

  const stop = studySessionStop(row.started_at, now);
  if (stop.minutes < STUDY_SESSION_MIN_MINUTES) {
    const { error: deleteError } = await supabase.from("study_sessions").delete().eq("user_id", userId).eq("id", id);
    if (deleteError) throw new Error(`Unable to discard study session: ${deleteError.message}`);
    return { session: null, discarded: true };
  }

  const { data: updated, error: updateError } = await supabase
    .from("study_sessions")
    .update({ ended_at: stop.endedAt, duration_minutes: stop.minutes, auto_stopped: stop.autoStopped })
    .eq("user_id", userId)
    .eq("id", id)
    .is("ended_at", null)
    .select(SESSION_COLUMNS)
    .maybeSingle();
  if (updateError) throw new Error(`Unable to stop study timer: ${updateError.message}`);
  if (updated) return { session: await withCourseName(supabase, userId, updated as SessionRow), discarded: false };

  // Stopped by another request in the meantime: return what it saved.
  const { data: latest, error: latestError } = await supabase
    .from("study_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (latestError) throw new Error(`Unable to load study session: ${latestError.message}`);
  return latest
    ? { session: await withCourseName(supabase, userId, latest as SessionRow), discarded: false }
    : { session: null, discarded: true };
}

/** Deletes a session (a running timer the student discards, or a saved one). */
export async function discardStudySession(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from("study_sessions").delete().eq("user_id", userId).eq("id", id).select("id");
  if (error) throw new Error(`Unable to discard study session: ${error.message}`);
  if (((data ?? []) as Array<{ id: string }>).length === 0) throw new StudySessionError(404, "That study session wasn't found.");
}

/**
 * Logs time studied away from the timer. The session counts toward `date`; its timestamps are
 * nominal: ending now for today, otherwise starting at noon UTC on that date (the same calendar
 * date in nearly every timezone).
 */
export async function logManualStudySession(
  supabase: SupabaseClient,
  userId: string,
  input: ParsedStudySessionManual,
  now: Date = new Date(),
): Promise<StudySession> {
  const today = await todayForUser(supabase, userId, now);
  if (input.date > today) throw new StudySessionError(400, "You can't log study time for a future day.");
  if (input.date < shiftDate(today, -STUDY_MANUAL_LOOKBACK_DAYS)) {
    throw new StudySessionError(400, `You can log study time from the last ${STUDY_MANUAL_LOOKBACK_DAYS} days.`);
  }
  const course = await resolveCourse(supabase, userId, input.courseId, null);
  const minutesMs = input.minutes * 60_000;
  const startedAt = input.date === today ? new Date(now.getTime() - minutesMs) : new Date(`${input.date}T12:00:00.000Z`);
  const endedAt = new Date(startedAt.getTime() + minutesMs);

  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      user_id: userId,
      course_id: course.courseId,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_minutes: input.minutes,
      source: "manual",
      study_date: input.date,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Unable to log study time: ${error?.message ?? "no row returned"}`);
  return toSession(data as SessionRow, course.courseName);
}

/** Every minute saved for one course (the course page's "studied this term" total). */
export async function loadCourseStudyMinutes(supabase: SupabaseClient, userId: string, courseId: string): Promise<number> {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("duration_minutes")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .not("ended_at", "is", null);
  if (error) throw new Error(`Unable to load study time: ${error.message}`);
  return totalStudyMinutes(
    ((data ?? []) as Array<{ duration_minutes: number | null }>).map((row) => ({
      courseId,
      courseName: null,
      studyDate: "",
      durationMinutes: row.duration_minutes,
    })),
  );
}

/** Study-time insights (packages/core/src/study-time/summary.ts) plus the running timer. */
export async function loadStudySummary(
  supabase: SupabaseClient,
  userId: string,
  options: { courseId?: string | null } = {},
  now: Date = new Date(),
): Promise<StudySummary> {
  const current = await readCurrentStudySession(supabase, userId, now);
  const today = await todayForUser(supabase, userId, now);

  const [sessionsResult, coursesResult, courseTotalMinutes] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("course_id, study_date, duration_minutes")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .gte("study_date", shiftDate(today, -STUDY_SUMMARY_LOOKBACK_DAYS))
      .order("study_date", { ascending: false }),
    supabase.from("courses").select("id, name").eq("user_id", userId),
    options.courseId ? loadCourseStudyMinutes(supabase, userId, options.courseId) : Promise.resolve(undefined),
  ]);
  if (sessionsResult.error) throw new Error(`Unable to load study time: ${sessionsResult.error.message}`);
  if (coursesResult.error) throw new Error(`Unable to load courses: ${coursesResult.error.message}`);

  const names = new Map(((coursesResult.data ?? []) as Array<{ id: string; name: string }>).map((course) => [course.id, course.name]));
  const sessions = ((sessionsResult.data ?? []) as Array<Pick<SessionRow, "course_id" | "study_date" | "duration_minutes">>).map(
    (row) => ({
      courseId: row.course_id,
      courseName: row.course_id ? (names.get(row.course_id) ?? null) : null,
      studyDate: row.study_date,
      durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    }),
  );

  return buildStudySummary(sessions, {
    today,
    running: current.running,
    autoStopped: current.autoStopped,
    courseTotalMinutes,
  });
}

/** The JSON error for a failed study-session request: StudySessionError keeps its status (and the running timer on 409). */
export function studySessionErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof StudySessionError) {
    return NextResponse.json(
      error.running ? { error: error.message, running: error.running } : { error: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}
