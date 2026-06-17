import { NextResponse } from "next/server";
import { generateTodayPlanForUser } from "@/lib/planner/plan-today";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export async function POST(request?: Request) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const result = await generateTodayPlanForUser({
      supabase: auth.supabase,
      userId: auth.user.id,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error generating daily plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
