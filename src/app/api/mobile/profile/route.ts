import { NextResponse } from "next/server";
import { defaultAtlasProfile, gpaScale, validateProfile } from "@personal-agent/core";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
const fields = "display_name, timezone, work_start_time, work_end_time, no_meeting_start, no_meeting_end, focus_block_minutes, gpa_scale";
export async function GET(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await auth.supabase.from("user_profiles").select(fields).eq("user_id", auth.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  const profile = { ...defaultAtlasProfile, ...data, display_name: data?.display_name ?? "", gpa_scale: gpaScale(data?.gpa_scale).id };
  for (const field of ["work_start_time", "work_end_time", "no_meeting_start", "no_meeting_end"] as const) if (profile[field]) profile[field] = profile[field]!.slice(0, 5);
  return NextResponse.json({ profile, email: auth.user.email ?? "", pendingEmail: auth.user.new_email });
}
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const profile = validateProfile((await request.json()).profile);
    const { error } = await auth.supabase.from("user_profiles").upsert({ user_id: auth.user.id, ...profile }, { onConflict: "user_id" });
    if (error) throw new Error("Unable to save profile. Please try again.");
    return NextResponse.json({ profile });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save profile." }, { status: 400 }); }
}
