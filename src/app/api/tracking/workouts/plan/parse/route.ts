import { NextResponse } from "next/server";
import { parseNaturalLanguageWorkoutSchedule } from "@/lib/tracking/natural-language-workout";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { text?: unknown; timezone?: unknown };
  const text = typeof payload.text === "string" ? payload.text : "";
  const timezone = typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone.trim() : "America/Toronto";

  try {
    const draft = await parseNaturalLanguageWorkoutSchedule({ text, timezone });
    return NextResponse.json({ draft }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse workout plan.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
