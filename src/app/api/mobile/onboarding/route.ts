import { NextRequest, NextResponse } from "next/server";
import { createBearerClient, getBearerToken } from "@/lib/supabase/bearer";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const VALID_WORKOUT_PREFERENCES = new Set(["none", "light", "moderate", "intense"]);
const VALID_TASK_TYPES = new Set(["general", "focus", "fitness", "wellness", "admin"]);

type MobileOnboardingPayload = {
  workStartTime?: unknown;
  workEndTime?: unknown;
  focusBlockMinutes?: unknown;
  workoutPreference?: unknown;
  goalTitle?: unknown;
  goalDescription?: unknown;
  goalPriority?: unknown;
  goalTaskType?: unknown;
  minimumDailyMinutes?: unknown;
};

function isClockTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
}

type ProfileRow = {
  work_start_time: string | null;
  work_end_time: string | null;
  focus_block_minutes: number | null;
  workout_preference: string | null;
};

/** GET -> { profile } with the saved planner preferences, or null before a profile exists. */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("user_profiles")
    .select("work_start_time, work_end_time, focus_block_minutes, workout_preference")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as ProfileRow | null;
  return NextResponse.json({
    profile: row
      ? {
          // Postgres time columns come back as HH:MM:SS.
          workStartTime: (row.work_start_time ?? "09:00").slice(0, 5),
          workEndTime: (row.work_end_time ?? "17:00").slice(0, 5),
          focusBlockMinutes: row.focus_block_minutes ?? 60,
          workoutPreference: row.workout_preference ?? "none",
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Bearer token required." }, { status: 401 });
  }

  const supabase = createBearerClient(accessToken);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Invalid session." },
      { status: 401 },
    );
  }

  const payload = (await request.json()) as MobileOnboardingPayload;
  const workStartTime = stringValue(payload.workStartTime) || "09:00";
  const workEndTime = stringValue(payload.workEndTime) || "17:00";

  if (!isClockTime(workStartTime) || !isClockTime(workEndTime) || workEndTime <= workStartTime) {
    return NextResponse.json(
      { error: "Work hours must be valid HH:MM times and end after start." },
      { status: 400 },
    );
  }

  const focusBlockMinutes = numberValue(payload.focusBlockMinutes, 60, 15, 240);
  // Omitted (wellness tracking off) leaves the saved preference untouched.
  const workoutPreference = stringValue(payload.workoutPreference);
  const workoutPreferenceUpdate =
    payload.workoutPreference === undefined
      ? {}
      : { workout_preference: VALID_WORKOUT_PREFERENCES.has(workoutPreference) ? workoutPreference : "none" };

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      focus_block_minutes: focusBlockMinutes,
      ...workoutPreferenceUpdate,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const goalTitle = stringValue(payload.goalTitle);
  let goalsCreated = 0;

  if (goalTitle) {
    const goalTaskType = stringValue(payload.goalTaskType);
    const { error: goalError } = await supabase.from("goals").insert({
      user_id: user.id,
      title: goalTitle,
      description: stringValue(payload.goalDescription) || null,
      priority: numberValue(payload.goalPriority, 1, 1, 3),
      task_type: VALID_TASK_TYPES.has(goalTaskType) ? goalTaskType : "focus",
      minimum_daily_minutes: numberValue(payload.minimumDailyMinutes, 30, 0, 720),
    });

    if (goalError) {
      return NextResponse.json({ error: goalError.message }, { status: 500 });
    }

    goalsCreated = 1;
  }

  return NextResponse.json({
    profileUpdated: true,
    goalsCreated,
  });
}
