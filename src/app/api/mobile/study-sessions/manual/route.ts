import { NextRequest, NextResponse } from "next/server";
import { parseStudySessionManualRequest } from "@personal-agent/core/study-time";
import { logManualStudySession, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/** POST { courseId?, date: YYYY-MM-DD, minutes: 1-720 } -> 201 { session } (StudySessionManualResponse). */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = parseStudySessionManualRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const session = await logManualStudySession(auth.supabase, auth.user.id, parsed.value);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to log study time.");
  }
}
