"use server";

import { revalidatePath } from "next/cache";
import type { Nudge } from "@personal-agent/core";
import { createClient } from "@/lib/supabase/server";
import { computeRecentNudges } from "@/lib/tracking/habit-report-request";
import {
  parseBodyProfileLogFormData,
  parseMealLogFormData,
  parseMealLogUpdateFormData,
  parseSavedMealFormData,
  parseWorkoutLogFormData,
  parseWorkoutScheduleItemFormData,
  type TrackingActionResult,
} from "@/lib/tracking";

function success(nudges?: Nudge[]): TrackingActionResult {
  return nudges && nudges.length > 0 ? { ok: true, nudges } : { ok: true };
}

function failure(error: unknown): TrackingActionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Unexpected tracking error.",
  };
}

function getId(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("Log id is required.");
  }
  return id;
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  return { supabase, userId: user.id };
}

function revalidateTrackingPaths() {
  revalidatePath("/");
  revalidatePath("/tracking");
  revalidatePath("/tracking/meals");
  revalidatePath("/tracking/workouts");
  revalidatePath("/tracking/workouts/plan");
}

export async function createMealLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const input = parseMealLogFormData(formData);

    const { error } = await supabase.from("meal_logs").insert({
      user_id: userId,
      ...input,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    const nudges = await computeRecentNudges({ supabase, userId, focus: "meal" });
    return success(nudges);
  } catch (error) {
    return failure(error);
  }
}

export async function removeMealLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { error } = await supabase.from("meal_logs").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function updateMealLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);
    const input = parseMealLogUpdateFormData(formData);

    const { error } = await supabase.from("meal_logs").update(input).eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function saveMeal(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const input = parseSavedMealFormData(formData);

    const { error } = await supabase.from("saved_meals").insert({
      user_id: userId,
      ...input,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function updateSavedMeal(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);
    const input = parseSavedMealFormData(formData);

    const { error } = await supabase
      .from("saved_meals")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function removeSavedMeal(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { error } = await supabase.from("saved_meals").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createMealLogFromSavedMeal(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const savedMealId = String(formData.get("saved_meal_id") ?? "").trim();

    if (!savedMealId) {
      throw new Error("Saved meal id is required.");
    }

    const { data: savedMeal, error: loadError } = await supabase
      .from("saved_meals")
      .select("name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .eq("id", savedMealId)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!savedMeal) {
      throw new Error("Saved meal was not found.");
    }

    const { error } = await supabase.from("meal_logs").insert({
      user_id: userId,
      logged_at: new Date().toISOString(),
      meal_type: "meal",
      ...savedMeal,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createWorkoutLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const input = parseWorkoutLogFormData(formData);

    const { error } = await supabase.from("workout_logs").insert({
      user_id: userId,
      ...input,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    const nudges = await computeRecentNudges({ supabase, userId, focus: "workout" });
    return success(nudges);
  } catch (error) {
    return failure(error);
  }
}

export async function removeWorkoutLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { error } = await supabase.from("workout_logs").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createWorkoutLogFromScheduleItem(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { data: scheduleItem, error: loadError } = await supabase
      .from("workout_schedule_items")
      .select("id, workout_type, tracking_method, title, duration_minutes, metrics, notes")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    if (!scheduleItem) {
      throw new Error("Planned workout was not found.");
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: existingLog, error: existingError } = await supabase
      .from("workout_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("source_schedule_item_id", scheduleItem.id)
      .gte("logged_at", todayStart.toISOString())
      .lte("logged_at", todayEnd.toISOString())
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingLog) {
      revalidateTrackingPaths();
      return success();
    }

    const { error } = await supabase.from("workout_logs").insert({
      user_id: userId,
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
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createWorkoutLogsFromTodaySchedule(): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const day = todayStart.getDay();
    const dayOfWeek = day === 0 ? 7 : day;

    const { data: scheduleItems, error: scheduleError } = await supabase
      .from("workout_schedule_items")
      .select("id, workout_type, tracking_method, title, duration_minutes, metrics, notes")
      .eq("user_id", userId)
      .eq("day_of_week", dayOfWeek)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (scheduleError) {
      throw new Error(scheduleError.message);
    }

    if (!scheduleItems || scheduleItems.length === 0) {
      revalidateTrackingPaths();
      return success();
    }

    const { data: existingLogs, error: existingError } = await supabase
      .from("workout_logs")
      .select("source_schedule_item_id")
      .eq("user_id", userId)
      .gte("logged_at", todayStart.toISOString())
      .lte("logged_at", todayEnd.toISOString());

    if (existingError) {
      throw new Error(existingError.message);
    }

    const completedIds = new Set(
      (existingLogs ?? []).flatMap((log) => (log.source_schedule_item_id ? [log.source_schedule_item_id] : [])),
    );
    const newLogs = scheduleItems
      .filter((item) => !completedIds.has(item.id))
      .map((item) => ({
        user_id: userId,
        source_schedule_item_id: item.id,
        logged_at: new Date().toISOString(),
        workout_type: item.workout_type,
        tracking_method: item.tracking_method,
        title: item.title,
        duration_minutes: item.duration_minutes,
        intensity: "moderate",
        calories_burned: null,
        metrics: item.metrics ?? {},
        notes: item.notes,
      }));

    if (newLogs.length > 0) {
      const { error } = await supabase.from("workout_logs").insert(newLogs);

      if (error) {
        throw new Error(error.message);
      }
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createWorkoutScheduleItem(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const input = parseWorkoutScheduleItemFormData(formData);

    const { data: lastItem, error: loadError } = await supabase
      .from("workout_schedule_items")
      .select("position")
      .eq("user_id", userId)
      .eq("day_of_week", input.day_of_week)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (loadError) {
      throw new Error(loadError.message);
    }

    const { error } = await supabase.from("workout_schedule_items").insert({
      user_id: userId,
      ...input,
      position: Number(lastItem?.position ?? -1) + 1,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function removeWorkoutScheduleItem(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { error } = await supabase.from("workout_schedule_items").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function createBodyProfileLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const input = parseBodyProfileLogFormData(formData);

    const { error } = await supabase.from("body_profile_logs").insert({
      user_id: userId,
      ...input,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}

export async function removeBodyProfileLog(formData: FormData): Promise<TrackingActionResult> {
  try {
    const { supabase, userId } = await getUserId();
    const id = getId(formData);

    const { error } = await supabase.from("body_profile_logs").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw new Error(error.message);
    }

    revalidateTrackingPaths();
    return success();
  } catch (error) {
    return failure(error);
  }
}
