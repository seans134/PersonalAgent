"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const VALID_WORKOUT_PREFERENCES = new Set(["none", "light", "moderate", "intense"]);

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const workStartTime = String(formData.get("work_start_time") ?? "09:00");
  const workEndTime = String(formData.get("work_end_time") ?? "17:00");
  const noMeetingStart = String(formData.get("no_meeting_start") ?? "");
  const noMeetingEnd = String(formData.get("no_meeting_end") ?? "");
  const focusBlockMinutesRaw = Number(formData.get("focus_block_minutes") ?? "60");
  const workoutPreferenceRaw = String(formData.get("workout_preference") ?? "none");
  const goalsInput = String(formData.get("goals") ?? "");

  const focusBlockMinutes = Number.isFinite(focusBlockMinutesRaw)
    ? Math.max(15, Math.min(240, focusBlockMinutesRaw))
    : 60;
  const workoutPreference = VALID_WORKOUT_PREFERENCES.has(workoutPreferenceRaw)
    ? workoutPreferenceRaw
    : "none";

  const goals = goalsInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((title, index) => ({
      user_id: user.id,
      title,
      priority: Math.min(index + 1, 3),
    }));

  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      no_meeting_start: noMeetingStart || null,
      no_meeting_end: noMeetingEnd || null,
      focus_block_minutes: focusBlockMinutes,
      workout_preference: workoutPreference,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`);
  }

  const { error: deleteError } = await supabase.from("goals").delete().eq("user_id", user.id);
  if (deleteError) {
    redirect(`/onboarding?error=${encodeURIComponent(deleteError.message)}`);
  }

  if (goals.length > 0) {
    const { error: goalsError } = await supabase.from("goals").insert(goals);
    if (goalsError) {
      redirect(`/onboarding?error=${encodeURIComponent(goalsError.message)}`);
    }
  }

  revalidatePath("/");
  redirect("/");
}
