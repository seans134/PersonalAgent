import { Calendar as LocalCalendar, dateInTimezone, shiftDate, type DayOfWeek } from "@personal-agent/core/calendar";
import type { createClient } from "@/lib/supabase/server";
import { deriveStudyTasks, mergePlanItemStatuses, type PlanItemStatus, type StudyTask } from "@personal-agent/core";
import { enhancePlanCopy, type EnhancePlanResult } from "./enhance-plan";
import {
  toPlannerGoals,
  toPlannerPreferences,
  type GoalRow,
  type UserProfileRow,
} from "./adapters";
import { generateDailyPlan } from "./planner";
import type { CalendarEvent } from "./types";
import type { TodayPlanCheckoff, TodayPlanContextEvent } from "./client-types";
import { readPlanCheckoff } from "./checkoff-store";
import { fetchAllCourseItems, fetchCoursesById } from "@/lib/courses/queries";
import { courseItemsToStudyItems, courseItemsToTodayBusyEvents } from "@/lib/courses/projection";
import { localDateOnly } from "@/lib/courses/local-time";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PlanResponse = {
  plan: ReturnType<typeof generateDailyPlan>;
  contextEvents: TodayPlanContextEvent[];
  summary?: string;
  checkoff: TodayPlanCheckoff;
  meta: {
    goalsCount: number;
    eventsCount: number;
    generatedAt: string;
    warnings: string[];
  };
};

type LocalCalendarEventRow = {
  id: string;
  title: string;
  category?: CalendarEvent["category"] | null;
  event_date: string;
  start_time: string;
  end_time: string;
  end_day_offset?: 0 | 1;
  effective_from?: string | null;
  effective_until?: string | null;
};

type ScheduleBlockRow = {
  id: string;
  title: string;
  category?: CalendarEvent["category"] | null;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  end_day_offset?: 0 | 1;
  effective_from?: string | null;
  effective_until?: string | null;
};

type LocalTodayContextEvent = TodayPlanContextEvent & {
  category?: CalendarEvent["category"];
};

function normalizeDbTime(value: string) {
  return value.slice(0, 5);
}

function toPlannerEvent(event: LocalTodayContextEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    startTime: event.startTime,
    endTime: event.endTime,
  };
}

async function fetchLocalTodayContextEvents(supabase: SupabaseClient, userId: string, timezone: string): Promise<LocalTodayContextEvent[]> {
  const today = new Date();
  const todayKey = dateInTimezone(today, timezone);

  const { data: localEvents, error: localEventsError } = await supabase
    .from("calendar_events")
    .select("id, title, category, event_date, start_time, end_time, end_day_offset")
    .eq("user_id", userId)
    .gte("event_date", shiftDate(todayKey, -1))
    .lte("event_date", todayKey)
    .order("start_time", { ascending: true });

  if (localEventsError) {
    throw new Error(`Unable to load local calendar events: ${localEventsError.message}`);
  }

  const { data: scheduleBlocks, error: scheduleBlocksError } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time, end_day_offset, effective_from, effective_until")
    .eq("user_id", userId)
    .order("start_time", { ascending: true });

  if (scheduleBlocksError) {
    throw new Error(`Unable to load recurring schedule: ${scheduleBlocksError.message}`);
  }

  const calendar = new LocalCalendar({
    events: ((localEvents ?? []) as LocalCalendarEventRow[]).map((event) => ({ id: event.id, title: event.title, category: event.category ?? "personal", date: event.event_date, startTime: normalizeDbTime(event.start_time), endTime: normalizeDbTime(event.end_time), endDayOffset: event.end_day_offset, source: "manual" as const })),
    scheduleBlocks: ((scheduleBlocks ?? []) as ScheduleBlockRow[]).map((block) => ({ id: block.id, title: block.title, category: block.category ?? "personal", daysOfWeek: block.days_of_week as DayOfWeek[], startTime: normalizeDbTime(block.start_time), endTime: normalizeDbTime(block.end_time), endDayOffset: block.end_day_offset, effectiveFrom: block.effective_from, effectiveUntil: block.effective_until })),
  });
  return calendar.getEventsForDate(todayKey).map((event) => ({ id: event.source === "manual" ? `local-${event.id}` : `schedule-${event.sourceId}`, title: event.title, category: event.category, startTime: event.startTime, endTime: event.endTime, source: event.source === "manual" ? "local" as const : "schedule" as const }));
}

export type PlanResult = {
  status: number;
  body: { error: string } | PlanResponse;
};

export async function generateTodayPlanForUser(input: {
  supabase: SupabaseClient;
  userId: string;
  enhancePlan?: (input: {
    plan: ReturnType<typeof generateDailyPlan>;
    goals: ReturnType<typeof toPlannerGoals>;
    preferences: ReturnType<typeof toPlannerPreferences>;
    eventsCount: number;
  }) => Promise<EnhancePlanResult>;
}): Promise<PlanResult> {
  const { supabase, userId, enhancePlan = enhancePlanCopy } = input;

  const { data: goalsRows, error: goalsError } = await supabase
    .from("goals")
    .select("id, title, description, priority, task_type, minimum_daily_minutes")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("priority", { ascending: true });

  if (goalsError) {
    throw new Error(`Unable to load goals: ${goalsError.message}`);
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("user_profiles")
    .select(
      "work_start_time, work_end_time, no_meeting_start, no_meeting_end, focus_block_minutes, workout_preference, timezone",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load profile: ${profileError.message}`);
  }

  if (!profileRow) {
    return {
      status: 400,
      body: { error: "User profile is missing. Complete onboarding first." },
    };
  }

  const goals = toPlannerGoals((goalsRows ?? []) as GoalRow[]);
  const preferences = toPlannerPreferences(profileRow as UserProfileRow);
  const timezone = (profileRow as { timezone?: string }).timezone ?? "America/Toronto";

  const warnings: string[] = [];
  let calendarEvents: CalendarEvent[] = [];
  let contextEvents: TodayPlanContextEvent[] = [];

  try {
    const localContextEvents = await fetchLocalTodayContextEvents(supabase, userId, timezone);
    const publicLocalContextEvents = localContextEvents.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      source: event.source,
    }));
    contextEvents = publicLocalContextEvents.sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    calendarEvents = localContextEvents.map(toPlannerEvent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load local schedule.";
    warnings.push(`Local schedule read failed: ${message}`);
  }

  let studyTasks: StudyTask[] = [];
  try {
    const [items, courseNames] = await Promise.all([
      fetchAllCourseItems(supabase, userId),
      fetchCoursesById(supabase, userId),
    ]);
    const todayLocalDate = localDateOnly(new Date().toISOString(), timezone);
    const studyItems = courseItemsToStudyItems(items, courseNames, timezone);
    studyTasks = deriveStudyTasks(studyItems, todayLocalDate);
    const examBusy = courseItemsToTodayBusyEvents(items, timezone, todayLocalDate);
    calendarEvents = [...calendarEvents, ...examBusy];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load courses.";
    warnings.push(`Course read failed: ${message}`);
  }

  const deterministicPlan = generateDailyPlan({
    goals,
    preferences,
    calendarEvents,
    studyTasks,
  });
  const enhanced = await enhancePlan({
    plan: deterministicPlan,
    goals,
    preferences,
    eventsCount: calendarEvents.length,
  });

  if (enhanced.warning) {
    warnings.push(enhanced.warning);
  }

  // Merge today's check-offs by stable item key, so a regenerated plan keeps its marks.
  const planDate = dateInTimezone(new Date(), timezone);
  let statuses: Record<string, PlanItemStatus> = {};
  let acceptedAt: string | null = null;
  try {
    const checkoff = await readPlanCheckoff(supabase, userId, planDate);
    statuses = checkoff.statuses;
    acceptedAt = checkoff.acceptedAt;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load check-offs.";
    warnings.push(`Check-off read failed: ${message}`);
  }
  const plan = { ...enhanced.plan, items: mergePlanItemStatuses(enhanced.plan.items, statuses) };

  return {
    status: 200,
    body: {
      plan,
      contextEvents,
      summary: enhanced.summary,
      checkoff: { planDate, timezone, acceptedAt },
      meta: {
        goalsCount: goals.length,
        eventsCount: contextEvents.length,
        generatedAt: new Date().toISOString(),
        warnings,
      },
    },
  };
}
