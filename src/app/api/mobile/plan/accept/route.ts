import { NextRequest, NextResponse } from "next/server";
import { parsePlanAcceptRequest } from "@personal-agent/core/planner";
import { acceptPlan, planDateWindowError } from "@/lib/planner/checkoff-store";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// Records that the student committed to today's plan (web cookie or mobile bearer).
// Types: PlanAcceptRequest / PlanAcceptResponse in packages/core/src/planner/checkoff.ts.

/** POST { planDate, itemCount } -> { planDate, acceptedAt, created }. Accepting again keeps the first time (created: false). */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = parsePlanAcceptRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const windowError = await planDateWindowError(auth.supabase, auth.user.id, parsed.value.planDate);
    if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });
    return NextResponse.json(await acceptPlan(auth.supabase, auth.user.id, parsed.value));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to accept plan." }, { status: 500 });
  }
}
