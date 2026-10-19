import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { loadSemesterTimeline } from "@/lib/courses/semester";

// Returns SemesterTimeline (packages/core/src/grades/semester.ts). ?term= picks one of `terms`;
// an unknown or missing term falls back to the term with items closest to today.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const term = new URL(request.url).searchParams.get("term");
  try {
    const timeline = await loadSemesterTimeline(auth.supabase, auth.user.id, term);
    return NextResponse.json(timeline);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load semester.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
