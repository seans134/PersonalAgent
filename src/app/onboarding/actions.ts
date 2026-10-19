"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markOnboardingComplete } from "@/lib/onboarding/status";
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
  revalidatePath("/goals");
  redirect("/goals");
}

/**
 * Reaching Done (by finishing step 2 or skipping it) marks onboarding complete,
 * whether or not a course and class times were added.
 */
export async function completeOnboarding(formData?: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  let firstCompletion = false;
  try {
    firstCompletion = !(await markOnboardingComplete(supabase, user.id)).alreadyCompleted;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finish onboarding.";
    // Errors go back to the page the student submitted from (class times or Done).
    const from = formData?.get("from") === "done" ? "/onboarding/done" : "/onboarding/schedule";
    redirect(`${from}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  // The flag lets Done capture onboarding_completed once, client-side.
  redirect(firstCompletion ? "/onboarding/done?completed=1" : "/onboarding/done");
}
