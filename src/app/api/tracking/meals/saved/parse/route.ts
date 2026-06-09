import { NextResponse } from "next/server";
import { parseNaturalLanguageMeal } from "@/lib/tracking/natural-language-meal";
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
    const draft = await parseNaturalLanguageMeal({ mode: "saved", text, timezone });
    return NextResponse.json({ draft }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse saved meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
