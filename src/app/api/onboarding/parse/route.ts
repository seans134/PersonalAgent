import { NextResponse } from "next/server";
import {
  type NaturalLanguageOnboardingMode,
  parseNaturalLanguageOnboarding,
} from "@/lib/onboarding/natural-language";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const MODES = new Set(["school_work", "weekly_rhythm", "goals"]);

// Mobile app depends on this response shape — see src/app/api/mobile-contract.test.ts before changing the envelope.
export async function POST(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { mode?: unknown; text?: unknown; timezone?: unknown };
  const text = typeof payload.text === "string" ? payload.text : "";
  const mode = typeof payload.mode === "string" && MODES.has(payload.mode) ? (payload.mode as NaturalLanguageOnboardingMode) : null;
  const timezone = typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone.trim() : "America/Toronto";

  if (!mode) {
    return NextResponse.json({ error: "Invalid onboarding parser mode." }, { status: 400 });
  }

  try {
    const draft = await parseNaturalLanguageOnboarding({ text, mode, timezone });
    return NextResponse.json({ draft }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse onboarding note.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
