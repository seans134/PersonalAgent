import { NextRequest, NextResponse } from "next/server";
import { markOnboardingComplete } from "@/lib/onboarding/status";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/**
 * GET  -> { completed, completedAt }  whether the student has reached Done.
 * POST -> { completedAt, alreadyCompleted }  stamps completion on reaching Done
 *         (finished or skipped); repeat calls keep the first timestamp.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("user_profiles")
    .select("onboarding_completed_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const completedAt = (data?.onboarding_completed_at as string | null | undefined) ?? null;
  return NextResponse.json({ completed: completedAt !== null, completedAt });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const result = await markOnboardingComplete(auth.supabase, auth.user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finish onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
