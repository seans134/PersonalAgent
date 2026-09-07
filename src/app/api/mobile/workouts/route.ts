import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { computeRecentNudges } from "@/lib/tracking/habit-report-request";

const WORKOUT_TYPES = new Set(["strength", "cardio", "recovery", "sport"]);
const INTENSITIES = new Set(["light", "moderate", "intense"]);
const METHODS_BY_TYPE: Record<string, string[]> = {
  strength: ["sets_reps_weight", "bodyweight_sets"],
  cardio: ["distance_time", "time_only", "intervals"],
  recovery: ["mobility_flow", "stretching", "breathwork"],
  sport: ["game", "practice", "skills"],
};

type WorkoutPayload = {
  id?: unknown;
  scheduleItemId?: unknown;
  workoutType?: unknown;
  trackingMethod?: unknown;
  title?: unknown;
  durationMinutes?: unknown;
  intensity?: unknown;
  caloriesBurned?: unknown;
  metrics?: unknown;
  notes?: unknown;
};

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function appDayOfWeek(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a whole number greater than zero.`);
  return number;
}

function optionalNonNegativeInteger(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a whole number zero or greater.`);
  return number;
}

function normalizeWorkoutType(value: unknown) {
  return typeof value === "string" && WORKOUT_TYPES.has(value) ? value : "strength";
}

function normalizeTrackingMethod(workoutType: string, value: unknown) {
  const validMethods = METHODS_BY_TYPE[workoutType] ?? METHODS_BY_TYPE.strength;
  return typeof value === "string" && validMethods.includes(value) ? value : validMethods[0];
}

function normalizeIntensity(value: unknown) {
  return typeof value === "string" && INTENSITIES.has(value) ? value : "moderate";
}

function normalizeMetrics(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === "string" || typeof entry === "number" || entry === null),
  );
}

function workoutInput(payload: WorkoutPayload) {
  const workoutType = normalizeWorkoutType(payload.workoutType);
  const trackingMethod = normalizeTrackingMethod(workoutType, payload.trackingMethod);

  return {
    logged_at: new Date().toISOString(),
    workout_type: workoutType,
    tracking_method: trackingMethod,
    title: requiredText(payload.title, "Workout title"),
    duration_minutes: optionalPositiveInteger(payload.durationMinutes, "Duration"),
    intensity: normalizeIntensity(payload.intensity),
    calories_burned: optionalNonNegativeInteger(payload.caloriesBurned, "Calories burned"),
    metrics: normalizeMetrics(payload.metrics),
    notes: optionalText(payload.notes),
  };
}

function workoutId(payload: WorkoutPayload) {
  return requiredText(payload.id, "Workout id");
}

async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  return { auth };
}

async function loadWorkoutData(auth: NonNullable<Awaited<ReturnType<typeof getAuthenticatedRequestClient>>>) {
  const { start, end } = todayBounds();

  const [logsResult, plannedResult] = await Promise.all([
    auth.supabase
      .from("workout_logs")
      .select("id, source_schedule_item_id, logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes")
      .eq("user_id", auth.user.id)
      .gte("logged_at", start.toISOString())
      .lte("logged_at", end.toISOString())
      .order("logged_at", { ascending: false }),
    auth.supabase
      .from("workout_schedule_items")
      .select("id, workout_type, tracking_method, title, duration_minutes, metrics, notes")
      .eq("user_id", auth.user.id)
      .eq("day_of_week", appDayOfWeek(start))
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (logsResult.error || plannedResult.error) {
    throw new Error(logsResult.error?.message ?? plannedResult.error?.message ?? "Unable to load workouts.");
  }

  return {
    workouts: logsResult.data ?? [],
    plannedWorkouts: plannedResult.data ?? [],
  };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    return NextResponse.json(await loadWorkoutData(result.auth));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load workouts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as WorkoutPayload;
    const { data, error } = await result.auth.supabase
      .from("workout_logs")
      .insert({
        user_id: result.auth.user.id,
        ...workoutInput(payload),
      })
      .select("id, source_schedule_item_id, logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nudges = await computeRecentNudges({
      supabase: result.auth.supabase,
      userId: result.auth.user.id,
      focus: "workout",
    });
    return NextResponse.json({ workout: data, nudges }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as WorkoutPayload;
    const scheduleItemId = requiredText(payload.scheduleItemId, "Schedule item id");
    const { start, end } = todayBounds();

    const { data: existingLog, error: existingError } = await result.auth.supabase
      .from("workout_logs")
      .select("id, source_schedule_item_id, logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes")
      .eq("user_id", result.auth.user.id)
      .eq("source_schedule_item_id", scheduleItemId)
      .gte("logged_at", start.toISOString())
      .lte("logged_at", end.toISOString())
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existingLog) {
      return NextResponse.json({ workout: existingLog });
    }

    const { data: scheduleItem, error: loadError } = await result.auth.supabase
      .from("workout_schedule_items")
      .select("id, workout_type, tracking_method, title, duration_minutes, metrics, notes")
      .eq("id", scheduleItemId)
      .eq("user_id", result.auth.user.id)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    if (!scheduleItem) {
      return NextResponse.json({ error: "Planned workout was not found." }, { status: 404 });
    }

    const { data, error } = await result.auth.supabase
      .from("workout_logs")
      .insert({
        user_id: result.auth.user.id,
        source_schedule_item_id: scheduleItem.id,
        logged_at: new Date().toISOString(),
        workout_type: scheduleItem.workout_type,
        tracking_method: scheduleItem.tracking_method,
        title: scheduleItem.title,
        duration_minutes: scheduleItem.duration_minutes,
        intensity: "moderate",
        calories_burned: null,
        metrics: scheduleItem.metrics ?? {},
        notes: scheduleItem.notes,
      })
      .select("id, source_schedule_item_id, logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nudges = await computeRecentNudges({
      supabase: result.auth.supabase,
      userId: result.auth.user.id,
      focus: "workout",
    });
    return NextResponse.json({ workout: data, nudges }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to track planned workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as WorkoutPayload;
    const { error } = await result.auth.supabase
      .from("workout_logs")
      .delete()
      .eq("id", workoutId(payload))
      .eq("user_id", result.auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove workout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
