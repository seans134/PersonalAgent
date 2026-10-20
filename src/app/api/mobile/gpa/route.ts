import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { loadGpaSummary } from "@/lib/courses/gpa";

// Returns GpaSummary (packages/core/src/grades/gpa.ts): per-term and cumulative GPA, excluded
// courses, the target-grade projection, and (with ?target=3.7) the term GPA needed to reach that
// cumulative GPA. ?term= picks which term the target applies to (default: the latest open term).
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const targetText = params.get("target")?.trim() ?? "";
  const targetGpa = targetText ? Number(targetText) : null;
  // A target above the scale's top comes back as out_of_reach; here only reject non-numbers.
  if (targetGpa !== null && (!Number.isFinite(targetGpa) || targetGpa <= 0)) {
    return NextResponse.json({ error: "Target GPA must be a number above 0." }, { status: 400 });
  }
  try {
    const summary = await loadGpaSummary(auth.supabase, auth.user.id, { targetGpa, term: params.get("term") });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load GPA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
