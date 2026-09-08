import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether the user has finished (or skipped past) the guided onboarding flow at
 * least once. Once complete, the schedule / weekly rhythm / goals pages drop
 * their step framing and stop chaining into each other.
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
