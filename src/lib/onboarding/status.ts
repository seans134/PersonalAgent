import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether the user has finished (or skipped past) the guided onboarding flow at
 * least once. Once complete, the courses / class times pages drop their step
 * framing and stop chaining into each other.
 */
export async function isOnboardingComplete(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data?.onboarding_completed_at);
}

export type MarkOnboardingCompleteResult = {
  completedAt: string;
  /** True when an earlier visit to Done had already set the timestamp. */
  alreadyCompleted: boolean;
};

/**
 * Stamps `onboarding_completed_at` the first time a student reaches Done, by
 * finishing or skipping. Later calls keep the original timestamp. The upsert
 * also creates the profile row (with default work hours) for students who
 * skipped everything, so the planner has a profile to read.
 */
export async function markOnboardingComplete(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MarkOnboardingCompleteResult> {
  const { data: existing, error: readError } = await supabase
    .from("user_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  if (existing?.onboarding_completed_at) {
    return { completedAt: existing.onboarding_completed_at as string, alreadyCompleted: true };
  }

  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, onboarding_completed_at: completedAt }, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }

  return { completedAt, alreadyCompleted: false };
}
