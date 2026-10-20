import { NextRequest, NextResponse } from "next/server";
import { isStudyId } from "@personal-agent/core/study-time";
import { loadStudySummary, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/** GET ?courseId= -> StudySummary (packages/core/src/study-time/summary.ts), with the running timer. */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const courseId = request.nextUrl.searchParams.get("courseId");
  if (courseId !== null && !isStudyId(courseId)) {
    return NextResponse.json({ error: "courseId must be an id." }, { status: 400 });
  }
  try {
    return NextResponse.json(await loadStudySummary(auth.supabase, auth.user.id, { courseId }));
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to load study time.");
  }
}
