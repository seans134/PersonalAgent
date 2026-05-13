import { fetchTodayCalendarEvents } from "@/lib/google/calendar";
import type { createClient } from "@/lib/supabase/server";
import { enhancePlanCopy, type EnhancePlanResult } from "./enhance-plan";
import {
  toPlannerCalendarEvents,
  toPlannerGoals,
  toPlannerPreferences,
  type GoalRow,
  type UserProfileRow,
} from "./adapters";
import { generateDailyPlan } from "./planner";
import type { CalendarEvent } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PlanResponse = {
  plan: ReturnType<typeof generateDailyPlan>;
  summary?: string;
  meta: {
    goalsCount: number;
    eventsCount: number;
    generatedAt: string;
    warnings: string[];
  };
};

export type PlanResult = {
  status: number;
  body: { error: string } | PlanResponse;
};

export async function generateTodayPlanForUser(input: {
  supabase: SupabaseClient;
  userId: string;
  fetchEvents?: typeof fetchTodayCalendarEvents;
  enhancePlan?: (input: {
    plan: ReturnType<typeof generateDailyPlan>;
    goals: ReturnType<typeof toPlannerGoals>;
    preferences: ReturnType<typeof toPlannerPreferences>;
    eventsCount: number;
  }) => Promise<EnhancePlanResult>;
}): Promise<PlanResult> {
  const {
    supabase,
    userId,
    fetchEvents = fetchTodayCalendarEvents,
    enhancePlan = enhancePlanCopy,
  } = input;

  const { data: goalsRows, error: goalsError } = await supabase
    .from("goals")
    .select("title, priority")
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

  try {
    const events = await fetchEvents(supabase, userId);
    calendarEvents = toPlannerCalendarEvents(events);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch calendar events.";
    warnings.push(`Calendar read failed: ${message}`);
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
      summary: enhanced.summary,
      meta: {
        goalsCount: goals.length,
        eventsCount: calendarEvents.length,
        generatedAt: new Date().toISOString(),
        warnings,
      },
    },
  };
}
