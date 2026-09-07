import {
  computeHabitMetrics,
  computeNudges,
  shiftDate,
  type HabitDigest,
  type HabitMealLog,
  type HabitMetrics,
  type HabitPeriod,
  type HabitTargets,
  type HabitWorkoutLog,
  type Nudge,
} from "@personal-agent/core";
import type { createClient } from "@/lib/supabase/server";
import type { HabitDigestPromptInput } from "@/lib/gemini/client";
import { generateHabitDigest } from "./habit-insights";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const DEFAULT_TIMEZONE = "America/Toronto";
const PERIOD_DAYS: Record<HabitPeriod, number> = { daily: 1, weekly: 7 };

export type HabitReport = {
  period: HabitPeriod;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: HabitMetrics;
  nudges: Nudge[];
  digest: HabitDigest;
  source: string;
};

export type RunHabitReportInput = {
  supabase: SupabaseClient;
  userId: string;
  period: HabitPeriod;
  referenceDate?: string; // local 'YYYY-MM-DD'; defaults to today in `timezone`
  timezone?: string;
  /** Injectable so route tests never hit the live Gemini API. */
  generateOutput?: (input: HabitDigestPromptInput) => Promise<unknown>;
};

export type HabitReportResult =
  | { ok: true; report: HabitReport }
  | { ok: false; error: string; status: number };

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function localToday(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Gathers logs for the window, computes metrics + nudges, generates the digest, upserts
 * the report, and returns it. Mirrors runMealSuggestion's context-gathering approach.
 */
export async function runHabitReport(input: RunHabitReportInput): Promise<HabitReportResult> {
  const { supabase, userId, period } = input;
  const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : DEFAULT_TIMEZONE;
  const days = PERIOD_DAYS[period];
  const endDate = isIsoDate(input.referenceDate) ? input.referenceDate : localToday(timezone);
  const startDate = shiftDate(endDate, -(days - 1));

  // Over-fetch by a day on each side so timezone offsets never clip boundary logs; the
  // engine buckets precisely and ignores anything outside the window's day keys.
  const fetchStartIso = `${shiftDate(startDate, -1)}T00:00:00.000Z`;
  const fetchEndIso = `${shiftDate(endDate, 1)}T23:59:59.999Z`;
  const previousStart = shiftDate(startDate, -days);

  const [mealsResult, workoutsResult, bodyProfileResult, goalsResult, previousResult] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("logged_at, calories, protein_grams, carbs_grams, fat_grams, fiber_grams")
      .eq("user_id", userId)
      .gte("logged_at", fetchStartIso)
      .lte("logged_at", fetchEndIso)
      .order("logged_at", { ascending: true }),
    supabase
      .from("workout_logs")
      .select("logged_at, workout_type, duration_minutes, intensity")
      .eq("user_id", userId)
      .gte("logged_at", fetchStartIso)
      .lte("logged_at", fetchEndIso)
      .order("logged_at", { ascending: true }),
    supabase
      .from("body_profile_logs")
      .select("maintenance_calories, logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, description, priority, task_type, minimum_daily_minutes")
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("priority", { ascending: true })
      .limit(8),
    supabase
      .from("habit_reports")
      .select("metrics")
      .eq("user_id", userId)
      .eq("period", period)
      .eq("period_start", previousStart)
      .maybeSingle(),
  ]);

  const failed = [mealsResult, workoutsResult, bodyProfileResult, goalsResult].find((result) => result.error);
  if (failed?.error) {
    return { ok: false, error: failed.error.message, status: 500 };
  }

  const maintenanceCalories = bodyProfileResult.data?.maintenance_calories ?? null;
  const targets: HabitTargets = {
    calorieTarget: typeof maintenanceCalories === "number" ? maintenanceCalories : null,
    proteinTarget: null,
  };

  const metrics = computeHabitMetrics({
    meals: (mealsResult.data ?? []) as HabitMealLog[],
    workouts: (workoutsResult.data ?? []) as HabitWorkoutLog[],
    targets,
    range: { endDate, days, timezone },
  });
  const nudges = computeNudges(metrics);
  const previousMetrics = (previousResult.data?.metrics as HabitMetrics | undefined) ?? null;

  const { digest, source } = await generateHabitDigest({
    period,
    timezone,
    metrics,
    nudges,
    goals: goalsResult.data ?? [],
    previousMetrics,
    generateOutput: input.generateOutput,
  });

  const generatedAt = new Date().toISOString();
  const model = source === "gemini" ? process.env.GEMINI_MODEL ?? "gemini-2.0-flash" : "deterministic";

  const upsert = await supabase
    .from("habit_reports")
    .upsert(
      {
        user_id: userId,
        period,
        period_start: startDate,
        period_end: endDate,
        generated_at: generatedAt,
        metrics,
        digest,
        model,
      },
      { onConflict: "user_id,period,period_start" },
    )
    .select("generated_at")
    .maybeSingle();

  if (upsert.error) {
    return { ok: false, error: upsert.error.message, status: 500 };
  }

  return {
    ok: true,
    report: {
      period,
      periodStart: startDate,
      periodEnd: endDate,
      generatedAt: upsert.data?.generated_at ?? generatedAt,
      metrics,
      nudges,
      digest,
      source: model,
    },
  };
}

/**
 * Computes the deterministic nudges for the trailing week without any LLM call or
 * persistence — cheap enough to run inline right after a meal or workout is logged.
 * Returns an empty list on any failure so it never blocks logging.
 */
export async function computeRecentNudges(input: {
  supabase: SupabaseClient;
  userId: string;
  focus?: "meal" | "workout";
  timezone?: string;
  referenceDate?: string;
  limit?: number;
}): Promise<Nudge[]> {
  try {
    const timezone =
      typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : DEFAULT_TIMEZONE;
    const days = 7;
    const endDate = isIsoDate(input.referenceDate) ? input.referenceDate : localToday(timezone);
    const startDate = shiftDate(endDate, -(days - 1));
    const fetchStartIso = `${shiftDate(startDate, -1)}T00:00:00.000Z`;
    const fetchEndIso = `${shiftDate(endDate, 1)}T23:59:59.999Z`;

    const [mealsResult, workoutsResult, bodyProfileResult] = await Promise.all([
      input.supabase
        .from("meal_logs")
        .select("logged_at, calories, protein_grams, carbs_grams, fat_grams, fiber_grams")
        .eq("user_id", input.userId)
        .gte("logged_at", fetchStartIso)
        .lte("logged_at", fetchEndIso),
      input.supabase
        .from("workout_logs")
        .select("logged_at, workout_type, duration_minutes, intensity")
        .eq("user_id", input.userId)
        .gte("logged_at", fetchStartIso)
        .lte("logged_at", fetchEndIso),
      input.supabase
        .from("body_profile_logs")
        .select("maintenance_calories, logged_at")
        .eq("user_id", input.userId)
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (mealsResult.error || workoutsResult.error) {
      return [];
    }

    const maintenanceCalories = bodyProfileResult.data?.maintenance_calories ?? null;
    const metrics = computeHabitMetrics({
      meals: (mealsResult.data ?? []) as HabitMealLog[],
      workouts: (workoutsResult.data ?? []) as HabitWorkoutLog[],
      targets: {
        calorieTarget: typeof maintenanceCalories === "number" ? maintenanceCalories : null,
        proteinTarget: null,
      },
      range: { endDate, days, timezone },
    });

    return computeNudges(metrics, { focus: input.focus, limit: input.limit ?? 2 });
  } catch {
    return [];
  }
}

/**
 * Returns the stored report for the current period when present, otherwise generates and
 * persists a fresh one. `refresh` forces regeneration.
 */
export async function getHabitReport(
  input: RunHabitReportInput & { refresh?: boolean },
): Promise<HabitReportResult> {
  const { supabase, userId, period } = input;
  const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : DEFAULT_TIMEZONE;
  const days = PERIOD_DAYS[period];
  const endDate = isIsoDate(input.referenceDate) ? input.referenceDate : localToday(timezone);
  const startDate = shiftDate(endDate, -(days - 1));

  if (!input.refresh) {
    const existing = await supabase
      .from("habit_reports")
      .select("period, period_start, period_end, generated_at, metrics, digest, model")
      .eq("user_id", userId)
      .eq("period", period)
      .eq("period_start", startDate)
      .maybeSingle();

    if (existing.error) {
      return { ok: false, error: existing.error.message, status: 500 };
    }

    if (existing.data) {
      const metrics = existing.data.metrics as HabitMetrics;
      return {
        ok: true,
        report: {
          period,
          periodStart: existing.data.period_start,
          periodEnd: existing.data.period_end,
          generatedAt: existing.data.generated_at,
          metrics,
          nudges: computeNudges(metrics),
          digest: existing.data.digest as HabitDigest,
          source: existing.data.model ?? "deterministic",
        },
      };
    }
  }

  return runHabitReport({ ...input, referenceDate: endDate, timezone });
}
