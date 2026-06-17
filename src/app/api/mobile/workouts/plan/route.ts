import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const WORKOUT_TYPES = new Set(["strength", "cardio", "recovery", "sport"]);
const METHODS_BY_TYPE: Record<string, string[]> = {
  strength: ["sets_reps_weight", "bodyweight_sets"],
  cardio: ["distance_time", "time_only", "intervals"],
  recovery: ["mobility_flow", "stretching", "breathwork"],
  sport: ["game", "practice", "skills"],
};

type WorkoutPlanPayload = {
  id?: unknown;
  dayOfWeek?: unknown;
  workoutType?: unknown;
  trackingMethod?: unknown;
  title?: unknown;
  durationMinutes?: unknown;
  metrics?: unknown;
  notes?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function requiredDay(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 7) {
    throw new Error("Day must be between 1 and 7.");
  }
  return number;
}

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a whole number greater than zero.`);
  return number;
}

function optionalNonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or greater.`);
  return number;
}

function normalizeWorkoutType(value: unknown) {
  return typeof value === "string" && WORKOUT_TYPES.has(value) ? value : "strength";
}

function normalizeTrackingMethod(workoutType: string, value: unknown) {
  const validMethods = METHODS_BY_TYPE[workoutType] ?? METHODS_BY_TYPE.strength;
  return typeof value === "string" && validMethods.includes(value) ? value : validMethods[0];
}

function metricObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metricText(metrics: Record<string, unknown>, key: string) {
  return optionalText(metrics[key]);
}

function plannedMetrics(trackingMethod: string, value: unknown) {
  const metrics = metricObject(value);

  if (trackingMethod === "sets_reps_weight") {
    return {
      exercise_name: metricText(metrics, "exercise_name"),
      sets: optionalPositiveInteger(metrics.sets, "Sets"),
      reps: optionalPositiveInteger(metrics.reps, "Reps"),
      weight: optionalNonNegativeNumber(metrics.weight, "Weight"),
      weight_unit: metricText(metrics, "weight_unit") ?? "lb",
    };
  }

  if (trackingMethod === "bodyweight_sets") {
    return {
      exercise_name: metricText(metrics, "exercise_name"),
      sets: optionalPositiveInteger(metrics.sets, "Sets"),
      reps: optionalPositiveInteger(metrics.reps, "Reps"),
    };
  }

  return {};
}

function scheduleInput(payload: WorkoutPlanPayload) {
  const workoutType = normalizeWorkoutType(payload.workoutType);
  const trackingMethod = normalizeTrackingMethod(workoutType, payload.trackingMethod);
  const usesPlannedStrengthMetrics = trackingMethod === "sets_reps_weight";

  return {
    day_of_week: requiredDay(payload.dayOfWeek),
    workout_type: workoutType,
    tracking_method: trackingMethod,
    title: requiredText(payload.title, "Workout title"),
    duration_minutes: usesPlannedStrengthMetrics ? null : optionalPositiveInteger(payload.durationMinutes, "Duration"),
    metrics: plannedMetrics(trackingMethod, payload.metrics),
    notes: optionalText(payload.notes),
  };
}

async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { data, error } = await result.auth.supabase
    .from("workout_schedule_items")
    .select("id, day_of_week, position, workout_type, tracking_method, title, duration_minutes, metrics, notes")
    .eq("user_id", result.auth.user.id)
    .order("day_of_week", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scheduleItems: data ?? [] });
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as WorkoutPlanPayload;
    const input = scheduleInput(payload);
    const { data: lastItem, error: loadError } = await result.auth.supabase
      .from("workout_schedule_items")
      .select("position")
      .eq("user_id", result.auth.user.id)
      .eq("day_of_week", input.day_of_week)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const { data, error } = await result.auth.supabase
      .from("workout_schedule_items")
      .insert({
        user_id: result.auth.user.id,
        ...input,
        position: Number(lastItem?.position ?? -1) + 1,
      })
      .select("id, day_of_week, position, workout_type, tracking_method, title, duration_minutes, metrics, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scheduleItem: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add planned workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as WorkoutPlanPayload;
    const { error } = await result.auth.supabase
      .from("workout_schedule_items")
      .delete()
      .eq("id", requiredText(payload.id, "Planned workout id"))
      .eq("user_id", result.auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove planned workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
