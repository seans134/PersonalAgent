import { NextRequest, NextResponse } from "next/server";
import { isStudyId } from "@personal-agent/core/study-time";
import { stopStudySession, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/**
 * POST -> { session, discarded } (StudySessionStopResponse). Under a minute the session is
 * deleted (session null, discarded true). Stopping an already-stopped session returns it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  if (!isStudyId(id)) return NextResponse.json({ error: "That study session wasn't found." }, { status: 404 });
  try {
    return NextResponse.json(await stopStudySession(auth.supabase, auth.user.id, id));
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to stop study timer.");
  }
}
