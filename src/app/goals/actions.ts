"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const VALID_TASK_TYPES = new Set(["general", "focus", "fitness", "wellness", "admin", "exercise", "wellbeing"]);

function parseOptionalPositiveNumber(formData: FormData, key: string, label: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    redirect(`/goals?error=${encodeURIComponent(`${label} must be greater than zero.`)}`);
  }

  return value;
}

function parseTaskType(formData: FormData) {
  const raw = String(formData.get("task_type") ?? "general").trim().toLowerCase();
  if (raw === "exercise") {
    return "fitness";
  }

  if (raw === "wellbeing") {
    return "wellness";
  }

  return VALID_TASK_TYPES.has(raw) ? raw : "general";
}

function parseMinimumDailyMinutes(formData: FormData) {
  const raw = Number(formData.get("minimum_daily_minutes") ?? "0");
  if (!Number.isFinite(raw)) {
    return 0;
  }

  return Math.max(0, Math.min(720, Math.round(raw)));
}

export async function createGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const taskType = parseTaskType(formData);
  const minimumDailyMinutes = parseMinimumDailyMinutes(formData);

  if (!title) {
    redirect("/goals?error=Goal%20title%20is%20required");
  }

  const { error } = await supabase.from("goals").insert({
    user_id: user.id,
    title,
    description: description || null,
    task_type: taskType,
    minimum_daily_minutes: minimumDailyMinutes,
    end_date: endDate || null,
  });

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  redirect("/goals");
}

export async function saveFitnessOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const heightCm = parseOptionalPositiveNumber(formData, "height_cm", "Height");
  const weightKg = parseOptionalPositiveNumber(formData, "weight_kg", "Weight");
  const fitnessGoal = String(formData.get("fitness_goal") ?? "").trim();
  const fitnessGoalDetails = String(formData.get("fitness_goal_details") ?? "").trim();
  const minimumDailyMinutes = parseMinimumDailyMinutes(formData);

  if (heightCm === null && weightKg === null && !fitnessGoal) {
    redirect("/goals?error=Add%20height%2C%20weight%2C%20or%20a%20fitness%20goal");
  }

  if (heightCm !== null || weightKg !== null) {
    const { error } = await supabase.from("body_profile_logs").insert({
      user_id: user.id,
      logged_at: new Date().toISOString(),
      height_cm: heightCm,
      weight_kg: weightKg,
      body_fat_percentage: null,
      maintenance_calories: null,
      notes: fitnessGoal ? `Onboarding fitness goal: ${fitnessGoal}` : "Onboarding body profile.",
    });

    if (error) {
      redirect(`/goals?error=${encodeURIComponent(error.message)}`);
    }
  }

  if (fitnessGoal) {
    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      title: fitnessGoal,
      description: fitnessGoalDetails || null,
      priority: 2,
      task_type: "fitness",
      minimum_daily_minutes: minimumDailyMinutes,
      end_date: null,
    });

    if (error) {
      redirect(`/goals?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/goals");
  redirect("/goals");
}

export async function updateGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const taskType = parseTaskType(formData);
  const minimumDailyMinutes = parseMinimumDailyMinutes(formData);

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  if (!title) {
    redirect("/goals?error=Goal%20title%20is%20required");
  }

  const { error } = await supabase
    .from("goals")
    .update({
      title,
      description: description || null,
      task_type: taskType,
      minimum_daily_minutes: minimumDailyMinutes,
      end_date: endDate || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect("/goals");
}

export async function removeGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/goals").trim();

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  revalidatePath("/goals/completed");
  redirect(returnTo === "/goals/completed" ? "/goals/completed" : "/goals");
}

export async function completeGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  const { error } = await supabase
    .from("goals")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect("/goals");
}
