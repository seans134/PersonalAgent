import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { validateNaturalLanguageMealDraft } from "@/lib/tracking/natural-language-meal";
import { createClient } from "@/lib/supabase/server";

function revalidateTrackingPaths() {
  revalidatePath("/");
  revalidatePath("/tracking/meals");
  revalidatePath("/tracking/meals/saved");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown };

  try {
    const draft = validateNaturalLanguageMealDraft(payload.draft, "saved");
    if (draft.mode !== "saved") {
      return NextResponse.json({ error: "Invalid saved meal draft." }, { status: 400 });
    }

    const { error } = await supabase.from("saved_meals").insert({
      user_id: user.id,
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
    return NextResponse.json({ applied: { savedMealsCreated: 1 } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid saved meal draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
