import { NextRequest, NextResponse } from "next/server";
import { readCurrentStudySession, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/** GET -> { running, autoStopped } (StudySessionCurrentResponse). Caps a timer left past 6 hours. */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await readCurrentStudySession(auth.supabase, auth.user.id));
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to load study timer.");
  }
}
