import { NextRequest, NextResponse } from "next/server";
import { parseNaturalLanguageWorkout } from "@/lib/tracking/natural-language-workout";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { text?: unknown; timezone?: unknown };
  const text = typeof payload.text === "string" ? payload.text : "";
  const timezone = typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone.trim() : "America/Toronto";

  try {
    const draft = await parseNaturalLanguageWorkout({ text, timezone });
    return NextResponse.json({ draft }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse workout log.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
