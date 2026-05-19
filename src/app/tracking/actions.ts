"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseBodyProfileLogFormData,
  parseMealLogFormData,
  parseMealLogUpdateFormData,
  parseWorkoutLogFormData,
  type TrackingActionResult,
} from "@/lib/tracking";

function success(): TrackingActionResult {
  return { ok: true };
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
    return success();
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
    return success();
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
