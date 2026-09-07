import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { validateNaturalLanguageWorkoutDraft } from "@/lib/tracking/natural-language-workout";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

function revalidateTrackingPaths() {
  revalidatePath("/");
  revalidatePath("/tracking/workouts");
}

// Mobile app depends on this response shape — see src/app/api/mobile-contract.test.ts before changing the envelope.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown };

  try {
    const draft = validateNaturalLanguageWorkoutDraft(payload.draft);

    const { error } = await auth.supabase.from("workout_logs").insert({
      user_id: auth.user.id,
      logged_at: draft.logged_at,
      workout_type: draft.workout_type,
      tracking_method: draft.tracking_method,
      title: draft.title,
      duration_minutes: draft.duration_minutes,
      intensity: draft.intensity,
      calories_burned: draft.calories_burned,
      metrics: draft.metrics,
      notes: draft.notes,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTrackingPaths();
    return NextResponse.json({ applied: { workoutsCreated: 1 } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid workout draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
