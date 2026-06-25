import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { validateNaturalLanguageWorkoutScheduleDraft } from "@/lib/tracking/natural-language-workout";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

function revalidateTrackingPaths() {
  revalidatePath("/");
  revalidatePath("/tracking/workouts");
  revalidatePath("/tracking/workouts/plan");
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown };

  try {
    const draft = validateNaturalLanguageWorkoutScheduleDraft(payload.draft);

    if (draft.items.length === 0) {
      return NextResponse.json({ error: "No workout plan items to save." }, { status: 400 });
    }

    const { data: existingItems, error: loadError } = await auth.supabase
      .from("workout_schedule_items")
      .select("day_of_week, position")
      .eq("user_id", auth.user.id);

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    const nextPositionByDay = new Map<number, number>();
    for (const item of existingItems ?? []) {
      const day = Number(item.day_of_week);
      const position = Number(item.position);
      nextPositionByDay.set(day, Math.max(nextPositionByDay.get(day) ?? 0, Number.isFinite(position) ? position + 1 : 0));
    }

    const rows = draft.items.map((item) => {
      const position = nextPositionByDay.get(item.day_of_week) ?? 0;
      nextPositionByDay.set(item.day_of_week, position + 1);

      return {
        user_id: auth.user.id,
        ...item,
        position,
      };
    });

    const { error } = await auth.supabase.from("workout_schedule_items").insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTrackingPaths();
    return NextResponse.json({ applied: { scheduleItemsCreated: rows.length } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid workout plan draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
