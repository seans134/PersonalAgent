"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VALID_WORKOUT_PREFERENCES = new Set(["none", "light", "moderate", "intense"]);

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function parseOptionalTime(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

function parseOptionalPositiveNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function updatePlanningPreferences(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const workStartTime = String(formData.get("work_start_time") ?? "09:00");
  const workEndTime = String(formData.get("work_end_time") ?? "17:00");
  const noMeetingStart = parseOptionalTime(formData, "no_meeting_start");
  const noMeetingEnd = parseOptionalTime(formData, "no_meeting_end");
  const focusBlockMinutesRaw = Number(formData.get("focus_block_minutes") ?? "60");
  const workoutPreferenceRaw = String(formData.get("workout_preference") ?? "none");
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Toronto";

  const focusBlockMinutes = Number.isFinite(focusBlockMinutesRaw)
    ? Math.max(15, Math.min(240, Math.round(focusBlockMinutesRaw)))
    : 60;
  const workoutPreference = VALID_WORKOUT_PREFERENCES.has(workoutPreferenceRaw)
    ? workoutPreferenceRaw
    : "none";

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      no_meeting_start: noMeetingStart,
      no_meeting_end: noMeetingEnd,
      focus_block_minutes: focusBlockMinutes,
      workout_preference: workoutPreference,
      timezone,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?ok=Planning%20preferences%20saved");
}

export async function updateBodyMetrics(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const heightCm = parseOptionalPositiveNumber(formData.get("height_cm"));
  const weightKg = parseOptionalPositiveNumber(formData.get("weight_kg"));

  if (heightCm === null && weightKg === null) {
    redirect("/settings?error=Add%20a%20height%20or%20weight%20to%20save");
  }

  const { error } = await supabase.from("body_profile_logs").insert({
    user_id: user.id,
    logged_at: new Date().toISOString(),
    height_cm: heightCm,
    weight_kg: weightKg,
    body_fat_percentage: null,
    maintenance_calories: null,
    notes: "Updated from settings.",
  });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?ok=Body%20metrics%20saved");
}

export async function updateEmail(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/settings?error=Enter%20a%20new%20email%20address");
  }

  if (email === user.email) {
    redirect("/settings?error=That%20is%20already%20your%20email%20address");
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl()}/settings` },
  );

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings?ok=Check%20your%20new%20inbox%20to%20confirm%20the%20change");
}

export async function sendPasswordReset() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/auth");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/auth/update-password`,
  });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/settings?ok=Password%20reset%20link%20sent%20to%20your%20email");
}

export async function deleteAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/auth");
  }

  const password = String(formData.get("password") ?? "");
  const acknowledged = formData.get("acknowledge") === "on";

  if (!acknowledged) {
    redirect("/settings?error=Confirm%20you%20understand%20this%20is%20permanent");
  }

  // Re-authenticate with the current password before doing anything destructive.
  const { error: passwordError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (passwordError) {
    redirect("/settings?error=Incorrect%20password");
  }

  // Keep redirect() out of the try/catch: it signals by throwing, so catching
  // here would swallow the navigation.
  let deletionError: string | null = null;
  try {
    const admin = createAdminClient();
    // Hard delete. Every user-scoped table cascades on auth.users deletion.
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error) {
      deletionError = error.message;
    }
  } catch (error) {
    deletionError = error instanceof Error ? error.message : "Unable to delete account.";
  }

  if (deletionError) {
    redirect(`/settings?error=${encodeURIComponent(deletionError)}`);
  }

  await supabase.auth.signOut();
  redirect("/auth?ok=Account%20deleted");
}
