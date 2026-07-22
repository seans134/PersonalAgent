import type { Goal, PlannerPreferences } from "./types";

export type GoalRow = {
  title: string;
  description?: string | null;
  priority: number;
  task_type?: string | null;
  minimum_daily_minutes?: number | null;
};

export type UserProfileRow = {
  work_start_time: string;
  work_end_time: string;
  no_meeting_start: string | null;
  no_meeting_end: string | null;
  focus_block_minutes: number;
  workout_preference: "none" | "light" | "moderate" | "intense";
};

function normalizePriority(priority: number): 1 | 2 | 3 {
  if (priority <= 1) return 1;
  if (priority === 2) return 2;
  return 3;
}

function normalizeTaskType(value: string | null | undefined): Goal["taskType"] {
  if (
    value === "focus" ||
    value === "fitness" ||
    value === "wellness" ||
    value === "admin" ||
    value === "exercise" ||
    value === "wellbeing"
  ) {
    return value;
  }

  return "general";
}

function normalizeMinimumDailyMinutes(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(720, Math.round(value)));
}

function normalizeClockTime(value: string): string {
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  throw new Error(`Invalid clock time: ${value}`);
}

export function toPlannerGoals(rows: GoalRow[]): Goal[] {
  return rows
    .map((row) => ({
      title: row.title.trim(),
      description: row.description?.trim() || null,
      priority: normalizePriority(row.priority),
      taskType: normalizeTaskType(row.task_type),
      minimumDailyMinutes: normalizeMinimumDailyMinutes(row.minimum_daily_minutes),
    }))
    .filter((goal) => goal.title.length > 0)
    .sort((a, b) => a.priority - b.priority);
}

export function toPlannerPreferences(profile: UserProfileRow): PlannerPreferences {
  return {
    workStartTime: normalizeClockTime(profile.work_start_time),
    workEndTime: normalizeClockTime(profile.work_end_time),
    noMeetingStartTime: profile.no_meeting_start ? normalizeClockTime(profile.no_meeting_start) : null,
    noMeetingEndTime: profile.no_meeting_end ? normalizeClockTime(profile.no_meeting_end) : null,
    focusBlockMinutes: profile.focus_block_minutes,
    workoutPreference: profile.workout_preference,
  };
}

