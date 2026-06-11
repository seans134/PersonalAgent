"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const VALID_TASK_TYPES = new Set(["general", "focus", "fitness", "wellness", "admin", "exercise", "wellbeing"]);

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
