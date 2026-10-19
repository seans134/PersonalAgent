import { NextRequest, NextResponse } from "next/server";
import { isPlanDate, isPlanDateInWindow, parsePlanItemStatusRequest } from "@personal-agent/core/planner";
import { readPlanCheckoff, todayPlanDateForUser, writePlanItemStatus } from "@/lib/planner/checkoff-store";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// Today plan check-off contract, shared by web (cookie) and mobile (bearer).
// Types: PlanStatusResponse / PlanItemStatusRequest in packages/core/src/planner/checkoff.ts.

/** GET ?date=YYYY-MM-DD -> { planDate, statuses: { [itemKey]: "done" | "skipped" }, acceptedAt }. */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const requestedDate = request.nextUrl.searchParams.get("date");
  if (requestedDate !== null && !isPlanDate(requestedDate)) {
    return NextResponse.json({ error: "date must be a YYYY-MM-DD date." }, { status: 400 });
  }

  try {
    const today = await todayPlanDateForUser(auth.supabase, auth.user.id);
    const planDate = requestedDate ?? today;
    if (!isPlanDateInWindow(planDate, today)) {
      return NextResponse.json({ error: "date must be within a day of today." }, { status: 400 });
    }
    return NextResponse.json(await readPlanCheckoff(auth.supabase, auth.user.id, planDate));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load check-offs." }, { status: 500 });
  }
}

/** PUT { planDate, itemKey, itemType, status: "done" | "skipped" | null } -> { planDate, itemKey, status }. null undoes. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = parsePlanItemStatusRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const today = await todayPlanDateForUser(auth.supabase, auth.user.id);
    if (!isPlanDateInWindow(parsed.value.planDate, today)) {
      return NextResponse.json({ error: "planDate must be within a day of today." }, { status: 400 });
    }
    return NextResponse.json(await writePlanItemStatus(auth.supabase, auth.user.id, parsed.value));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save check-off." }, { status: 500 });
  }
}
