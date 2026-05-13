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

  const focusBlockMinutes = Number.isFinite(focusBlockMinutesRaw)
    ? Math.max(15, Math.min(240, focusBlockMinutesRaw))
    : 60;
  const workoutPreference = VALID_WORKOUT_PREFERENCES.has(workoutPreferenceRaw)
    ? workoutPreferenceRaw
    : "none";

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

  revalidatePath("/");
  redirect("/");
}
