"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const VALID_CATEGORIES = new Set(["school", "work", "study", "personal", "unavailable"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_RETURN_PATHS = new Set(["/onboarding/schedule", "/onboarding"]);

function getReturnTo(formData: FormData) {
  const returnTo = String(formData.get("return_to") ?? "/onboarding").trim();
  return VALID_RETURN_PATHS.has(returnTo) ? returnTo : "/onboarding";
}

function redirectWithError(returnTo: string, message: string): never {
  redirect(`${returnTo}?error=${encodeURIComponent(message)}`);
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function getDaysOfWeek(formData: FormData) {
  return formData
    .getAll("days_of_week")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

export async function createScheduleBlock(formData: FormData) {
  const supabase = await createClient();
  const returnTo = getReturnTo(formData);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();
  const daysOfWeek = getDaysOfWeek(formData);

  if (!title) {
    redirectWithError(returnTo, "Schedule title is required.");
  }

  if (!VALID_CATEGORIES.has(category)) {
    redirectWithError(returnTo, "Schedule category is invalid.");
  }

  if (daysOfWeek.length === 0) {
    redirectWithError(returnTo, "Choose at least one day.");
  }

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || toMinutes(endTime) <= toMinutes(startTime)) {
    redirectWithError(returnTo, "Use a valid start and end time.");
  }

  const { error } = await supabase.from("schedule_blocks").insert({
    user_id: user.id,
    title,
    category,
    days_of_week: [...new Set(daysOfWeek)].sort((a, b) => a - b),
    start_time: startTime,
    end_time: endTime,
  });

  if (error) {
    redirectWithError(returnTo, error.message);
  }

  if (category === "school" || category === "work") {
    await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        has_school_schedule: category === "school" ? true : undefined,
        has_work_schedule: category === "work" ? true : undefined,
      },
      { onConflict: "user_id" },
    );
  }

  revalidatePath("/");
  revalidatePath(returnTo);
  redirect(returnTo);
}

export async function removeScheduleBlock(formData: FormData) {
  const supabase = await createClient();
  const returnTo = getReturnTo(formData);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirectWithError(returnTo, "Schedule block id is required.");
  }

  const { error } = await supabase.from("schedule_blocks").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirectWithError(returnTo, error.message);
  }

  revalidatePath("/");
  revalidatePath(returnTo);
  redirect(returnTo);
}
