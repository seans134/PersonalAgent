import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { classifyCoachIntent } from "@/lib/tracking/coach-intent";
import {
  runMealSuggestion,
  type MealSuggestionRequestPayload,
} from "@/lib/tracking/meal-suggestion-request";
import { parseNaturalLanguageMeal } from "@/lib/tracking/natural-language-meal";

type AssistantPayload = MealSuggestionRequestPayload & {
  text?: unknown;
  forceIntent?: unknown;
};

const FORCEABLE_INTENTS = new Set(["log", "saved", "suggest"]);

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as AssistantPayload;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const timezone =
    typeof payload.timezone === "string" && payload.timezone.trim()
      ? payload.timezone.trim()
      : "America/Toronto";

  if (!text) {
    return NextResponse.json({ error: "Add a message before sending." }, { status: 400 });
  }

  try {
    // forceIntent lets the client re-run a message the classifier routed wrongly.
    const forced =
      typeof payload.forceIntent === "string" && FORCEABLE_INTENTS.has(payload.forceIntent)
        ? (payload.forceIntent as "log" | "saved" | "suggest")
        : null;
    const classification = forced
      ? { intent: forced, reason: "Re-run at the user's request.", source: "user" as const }
      : await classifyCoachIntent({
          domain: "meal",
          text,
          hasActiveSuggestion: Boolean(payload.currentDraft),
        });

    if (classification.intent === "suggest") {
      const result = await runMealSuggestion({
        supabase: auth.supabase,
        userId: auth.user.id,
        payload: { ...payload, feedback: text },
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json(
        {
          intent: "suggest",
          intent_reason: classification.reason,
          intent_source: classification.source,
          agent_reply: result.agentReply,
          suggestion: result.draft,
          draft: null,
          warnings: result.warnings,
        },
        { status: 200 },
      );
    }

    const draft = await parseNaturalLanguageMeal({
      mode: classification.intent,
      text,
      timezone,
    });

    return NextResponse.json(
      {
        intent: classification.intent,
        intent_reason: classification.reason,
        intent_source: classification.source,
        agent_reply: null,
        suggestion: null,
        draft,
        warnings: draft.warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to handle that message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
