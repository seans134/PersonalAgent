import { NextRequest, NextResponse } from "next/server";
import { parseStudySessionStartRequest } from "@personal-agent/core/study-time";
import { startStudySession, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// Study timer contract, shared by web (cookie) and mobile (bearer).
// Types: packages/core/src/study-time/sessions.ts.

/**
 * POST { courseId?, courseItemId?, planItemKey?, planDate? } -> 201 { session } (StudySessionStartResponse).
 * 409 { error, running } when a timer is already running.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }
  }
  const parsed = parseStudySessionStartRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const session = await startStudySession(auth.supabase, auth.user.id, parsed.value);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to start study timer.");
  }
}
