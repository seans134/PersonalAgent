import type { CalendarEvent, Goal, PlannerPreferences } from "./types";

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

export type GoogleCalendarEventRow = {
  id: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  htmlLink: string;
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

function toLocalTimeString(value: string, fallback: "start" | "end"): string {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return normalizeClockTime(value);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback === "start" ? "00:00" : "23:59";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date time: ${value}`);
  }

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

export function toPlannerCalendarEvents(events: GoogleCalendarEventRow[]): CalendarEvent[] {
  return events
    .map((event) => ({
      id: event.id,
      title: event.summary,
      startTime: toLocalTimeString(event.startsAt, "start"),
      endTime: toLocalTimeString(event.endsAt, "end"),
    }))
    .filter((event) => event.endTime > event.startTime)
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
}
