import { NextResponse } from "next/server";
import { SCHEDULE_UPLOAD_BYTES } from "@personal-agent/core";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { parseScheduleFile } from "@/lib/schedule/import";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > SCHEDULE_UPLOAD_BYTES + 65536) return NextResponse.json({ error: "Choose a file under 4 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a schedule file first.");
    if (file.size > SCHEDULE_UPLOAD_BYTES) return NextResponse.json({ error: "Choose a file under 4 MB." }, { status: 413 });
    const { data, error } = await auth.supabase.from("user_profiles").select("timezone").eq("user_id", auth.user.id).maybeSingle();
    if (error) throw new Error("Unable to load your timezone. Please try again.");
    const draft = await parseScheduleFile(file, data?.timezone || "America/Toronto");
    return NextResponse.json({ draft });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to parse schedule." }, { status: 400 }); }
}
