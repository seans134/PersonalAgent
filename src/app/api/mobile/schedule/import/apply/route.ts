import { NextResponse } from "next/server";
import { validateScheduleImport } from "@personal-agent/core";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
export async function POST(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const draft = validateScheduleImport(body.draft, true);
    const entries = draft.entries.filter((e) => e.include);
    if (!entries.length) throw new Error("Include at least one valid entry.");
    if (body.confirmed !== true) throw new Error("Review the schedule and confirm its dates before saving.");
    const { data: profile, error: profileError } = await auth.supabase.from("user_profiles").select("timezone").eq("user_id", auth.user.id).maybeSingle();
    if (profileError) throw new Error("Unable to load your timezone.");
    if (entries.some((e) => e.timezone !== (profile?.timezone || "America/Toronto"))) throw new Error("Use your Profile timezone for this schedule. Change it in Profile first if needed.");
    const { data, error } = await auth.supabase.rpc("apply_schedule_import", { entries: entries.map((e) => ({ ...e, allowOverlap: body.allowOverlaps === true })) });
    if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("overlap") ? 409 : 400 });
    return NextResponse.json({ applied: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save schedule." }, { status: 400 }); }
}
