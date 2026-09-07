import { NextRequest, NextResponse } from "next/server";
import { parseNaturalLanguageWorkoutSchedule } from "@/lib/tracking/natural-language-workout";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// Mobile app depends on this response shape — see src/app/api/mobile-contract.test.ts before changing the envelope.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
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
