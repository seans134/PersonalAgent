import { NextResponse } from "next/server";
import { generateTodayPlanForUser } from "@/lib/planner/plan-today";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const result = await generateTodayPlanForUser({
      supabase,
      userId: user.id,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error generating daily plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
