import type { createClient } from "@/lib/supabase/server";
import { enhancePlanCopy, type EnhancePlanResult } from "./enhance-plan";
import {
  toPlannerGoals,
  toPlannerPreferences,
  type GoalRow,
  type UserProfileRow,
} from "./adapters";
import { generateDailyPlan } from "./planner";
import type { CalendarEvent } from "./types";
import type { TodayPlanContextEvent } from "./client-types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PlanResponse = {
  plan: ReturnType<typeof generateDailyPlan>;
  contextEvents: TodayPlanContextEvent[];
  summary?: string;
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
};

type ScheduleBlockRow = {
  id: string;
  title: string;
  category?: CalendarEvent["category"] | null;
  days_of_week: number[];
  start_time: string;
  end_time: string;
};

type LocalTodayContextEvent = TodayPlanContextEvent & {
  category?: CalendarEvent["category"];
};

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

async function fetchLocalTodayContextEvents(supabase: SupabaseClient, userId: string): Promise<LocalTodayContextEvent[]> {
  const today = new Date();
  const todayKey = toDateKey(today);
  const dayOfWeek = today.getDay();

  const { data: localEvents, error: localEventsError } = await supabase
    .from("calendar_events")
    .select("id, title, category, event_date, start_time, end_time")
    .eq("user_id", userId)
    .eq("event_date", todayKey)
    .order("start_time", { ascending: true });

  if (localEventsError) {
    throw new Error(`Unable to load local calendar events: ${localEventsError.message}`);
  }

  const { data: scheduleBlocks, error: scheduleBlocksError } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", userId)
    .order("start_time", { ascending: true });

  if (scheduleBlocksError) {
    throw new Error(`Unable to load recurring schedule: ${scheduleBlocksError.message}`);
  }

  const events = ((localEvents ?? []) as LocalCalendarEventRow[]).map((event) => ({
    id: `local-${event.id}`,
    title: event.title,
    category: event.category ?? undefined,
    startTime: normalizeDbTime(event.start_time),
    endTime: normalizeDbTime(event.end_time),
    source: "local" as const,
  }));

  const recurring = ((scheduleBlocks ?? []) as ScheduleBlockRow[])
    .filter((block) => block.days_of_week.includes(dayOfWeek))
    .map((block) => ({
      id: `schedule-${block.id}`,
      title: block.title,
      category: block.category ?? undefined,
      startTime: normalizeDbTime(block.start_time),
      endTime: normalizeDbTime(block.end_time),
      source: "schedule" as const,
    }));

  return [...events, ...recurring].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
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
    .select("title, description, priority, task_type, minimum_daily_minutes")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("priority", { ascending: true });

  if (goalsError) {
    throw new Error(`Unable to load goals: ${goalsError.message}`);
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("user_profiles")
    .select("work_start_time, work_end_time, no_meeting_start, no_meeting_end, focus_block_minutes, workout_preference")
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

  const warnings: string[] = [];
  let calendarEvents: CalendarEvent[] = [];
  let contextEvents: TodayPlanContextEvent[] = [];

  try {
    const localContextEvents = await fetchLocalTodayContextEvents(supabase, userId);
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

  const deterministicPlan = generateDailyPlan({
    goals,
    preferences,
    calendarEvents,
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

  return {
    status: 200,
    body: {
      plan: enhanced.plan,
      contextEvents,
      summary: enhanced.summary,
      meta: {
        goalsCount: goals.length,
        eventsCount: contextEvents.length,
        generatedAt: new Date().toISOString(),
        warnings,
      },
    },
  };
}
