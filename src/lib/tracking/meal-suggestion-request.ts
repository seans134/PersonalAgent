import type { createClient } from "@/lib/supabase/server";
import { suggestMeal, type MealSuggestionResult } from "./meal-suggestions";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CalendarContextEvent = {
  title: string;
  startTime: string;
  endTime: string;
  source: "local" | "schedule";
};

type NutritionMealRow = {
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
};

type NutritionTotals = {
  calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  fiber_grams: number;
};

export type MealSuggestionRequestPayload = {
  currentIso?: unknown;
  currentLocalDate?: unknown;
  currentLocalTime?: unknown;
  currentDraft?: unknown;
  feedback?: unknown;
  todayEndIso?: unknown;
  todayStartIso?: unknown;
  timezone?: unknown;
};

export type MealSuggestionRequestResult =
  | { ok: true; agentReply: string; draft: MealSuggestionResult["draft"]; warnings: string[] }
  | { ok: false; error: string; status: number };

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function optionalIsoDate(value: unknown) {
  return isIsoDate(value) ? value : null;
}

function optionalIsoString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalLocalTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function normalizeDbTime(value: string) {
  return value.slice(0, 5);
}

function sumNutrition(rows: NutritionMealRow[]): NutritionTotals {
  return rows.reduce(
    (totals: NutritionTotals, row) => ({
      calories: totals.calories + Number(row.calories ?? 0),
      protein_grams: totals.protein_grams + Number(row.protein_grams ?? 0),
      carbs_grams: totals.carbs_grams + Number(row.carbs_grams ?? 0),
      fat_grams: totals.fat_grams + Number(row.fat_grams ?? 0),
      fiber_grams: totals.fiber_grams + Number(row.fiber_grams ?? 0),
    }),
    {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
    },
  );
}

function optionalFeedback(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
}

/**
 * Gathers every context row the meal suggester needs and runs it. Shared by the
 * dedicated suggest route and the unified coach assistant route so both produce
 * identical suggestions.
 */
export async function runMealSuggestion(input: {
  supabase: SupabaseClient;
  userId: string;
  payload: MealSuggestionRequestPayload;
}): Promise<MealSuggestionRequestResult> {
  const { supabase, userId, payload } = input;

  const timezone =
    typeof payload.timezone === "string" && payload.timezone.trim()
      ? payload.timezone.trim()
      : "America/Toronto";
  const userFeedback = optionalFeedback(payload.feedback);
  const fallbackBounds = todayBounds();
  const start = new Date(optionalIsoString(payload.todayStartIso) ?? fallbackBounds.start.toISOString());
  const end = new Date(optionalIsoString(payload.todayEndIso) ?? fallbackBounds.end.toISOString());
  const currentIso = optionalIsoString(payload.currentIso) ?? new Date().toISOString();
  const today = optionalIsoDate(payload.currentLocalDate) ?? toDateKey(start);
  const currentLocalTime = optionalLocalTime(payload.currentLocalTime);
  const dayOfWeek = start.getDay();
  const appDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

  const [
    profileResult,
    goalsResult,
    todayMealsResult,
    recentMealsResult,
    savedMealsResult,
    todayWorkoutLogsResult,
    plannedWorkoutsResult,
    bodyProfileResult,
    localEventsResult,
    scheduleBlocksResult,
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("work_start_time, work_end_time, focus_block_minutes, workout_preference")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, description, priority, task_type, minimum_daily_minutes")
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("priority", { ascending: true })
      .limit(8),
    supabase
      .from("meal_logs")
      .select("logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .eq("user_id", userId)
      .gte("logged_at", start.toISOString())
      .lte("logged_at", end.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("meal_logs")
      .select("logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams")
      .eq("user_id", userId)
      .lt("logged_at", start.toISOString())
      .order("logged_at", { ascending: false })
      .limit(20),
    supabase
      .from("saved_meals")
      .select("name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("workout_logs")
      .select("logged_at, workout_type, tracking_method, title, duration_minutes, intensity, notes")
      .eq("user_id", userId)
      .gte("logged_at", start.toISOString())
      .lte("logged_at", end.toISOString())
      .order("logged_at", { ascending: true }),
    supabase
      .from("workout_schedule_items")
      .select("workout_type, tracking_method, title, duration_minutes, notes")
      .eq("user_id", userId)
      .eq("day_of_week", appDayOfWeek)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("body_profile_logs")
      .select("height_cm, weight_kg, body_fat_percentage, maintenance_calories, notes, logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("calendar_events")
      .select("title, event_date, start_time, end_time")
      .eq("user_id", userId)
      .eq("event_date", today)
      .order("start_time", { ascending: true }),
    supabase
      .from("schedule_blocks")
      .select("title, days_of_week, start_time, end_time")
      .eq("user_id", userId)
      .order("start_time", { ascending: true }),
  ]);

  const results = [
    profileResult,
    goalsResult,
    todayMealsResult,
    recentMealsResult,
    savedMealsResult,
    todayWorkoutLogsResult,
    plannedWorkoutsResult,
    bodyProfileResult,
    localEventsResult,
    scheduleBlocksResult,
  ];
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    return { ok: false, error: failedResult.error.message, status: 500 };
  }

  const localEvents: CalendarContextEvent[] = (localEventsResult.data ?? []).map((event) => ({
    title: event.title,
    startTime: normalizeDbTime(event.start_time),
    endTime: normalizeDbTime(event.end_time),
    source: "local" as const,
  }));

  const recurringEvents: CalendarContextEvent[] = (scheduleBlocksResult.data ?? [])
    .filter((block) => Array.isArray(block.days_of_week) && block.days_of_week.includes(dayOfWeek))
    .map((block) => ({
      title: block.title,
      startTime: normalizeDbTime(block.start_time),
      endTime: normalizeDbTime(block.end_time),
      source: "schedule" as const,
    }));

  const todayMeals = todayMealsResult.data ?? [];
  const goals = goalsResult.data ?? [];
  const fitnessGoals = goals.filter((goal) => goal.task_type === "fitness");

  const suggestion = await suggestMeal({
    timezone,
    today,
    currentTimeContext: {
      currentIso,
      currentLocalDate: today,
      currentLocalTime,
      timezone,
    },
    profile: profileResult.data ?? null,
    latestBodyProfile: bodyProfileResult.data ?? null,
    nutritionContext: {
      todayTotals: sumNutrition(todayMeals as NutritionMealRow[]),
      mealsLoggedToday: todayMeals.length,
      fitnessGoals,
      explicitTargetsNote:
        "Use only explicit targets from goal titles/descriptions, maintenance_calories, or logged/saved meal data. Do not invent calorie or macro targets.",
    },
    goals,
    todayMeals,
    recentMeals: recentMealsResult.data ?? [],
    savedMeals: savedMealsResult.data ?? [],
    todayWorkouts: [
      ...(todayWorkoutLogsResult.data ?? []).map((workout) => ({ ...workout, source: "log" })),
      ...(plannedWorkoutsResult.data ?? []).map((workout) => ({ ...workout, source: "planned" })),
    ],
    todayEvents: [...localEvents, ...recurringEvents].sort((a, b) =>
      a.startTime < b.startTime ? -1 : 1,
    ),
    currentSuggestion: payload.currentDraft ?? null,
    userFeedback,
  });

  return {
    ok: true,
    agentReply: suggestion.agent_reply,
    draft: suggestion.draft
      ? {
          ...suggestion.draft,
          logged_at: currentIso,
        }
      : null,
    warnings: suggestion.warnings,
  };
}
