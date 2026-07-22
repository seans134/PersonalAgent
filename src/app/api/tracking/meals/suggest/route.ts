import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import {
  runMealSuggestion,
  type MealSuggestionRequestPayload,
} from "@/lib/tracking/meal-suggestion-request";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as MealSuggestionRequestPayload;

  try {
    const result = await runMealSuggestion({
      supabase: auth.supabase,
      userId: auth.user.id,
      payload,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        agent_reply: result.agentReply,
        draft: result.draft,
        warnings: result.warnings,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to suggest a meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
