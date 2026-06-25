import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { validateNaturalLanguageMealDraft } from "@/lib/tracking/natural-language-meal";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

function revalidateTrackingPaths() {
  revalidatePath("/");
  revalidatePath("/tracking/meals");
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown };

  try {
    const draft = validateNaturalLanguageMealDraft(payload.draft, "log");
    if (draft.mode !== "log") {
      return NextResponse.json({ error: "Invalid meal log draft." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("meal_logs").insert({
      user_id: auth.user.id,
      logged_at: draft.logged_at,
      meal_type: draft.meal_type,
      name: draft.name,
      calories: draft.calories,
      protein_grams: draft.protein_grams,
      carbs_grams: draft.carbs_grams,
      fat_grams: draft.fat_grams,
      fiber_grams: draft.fiber_grams,
      notes: draft.notes,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateTrackingPaths();
    return NextResponse.json({ applied: { mealsLogged: 1 } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid meal draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
