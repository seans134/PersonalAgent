import { NextRequest, NextResponse } from "next/server";
import { isStudyId } from "@personal-agent/core/study-time";
import { discardStudySession, studySessionErrorResponse } from "@/lib/study/sessions";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

/** DELETE -> { ok: true }. Discards a running timer (or removes a saved session). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  if (!isStudyId(id)) return NextResponse.json({ error: "That study session wasn't found." }, { status: 404 });
  try {
    await discardStudySession(auth.supabase, auth.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return studySessionErrorResponse(error, "Unable to discard study session.");
  }
}
