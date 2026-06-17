import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

type SavedMealPayload = {
  id?: unknown;
  mealId?: unknown;
  name?: unknown;
  calories?: unknown;
  proteinGrams?: unknown;
  carbsGrams?: unknown;
  fatGrams?: unknown;
  fiberGrams?: unknown;
  notes?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, label: string) {
  const text = optionalText(value);

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  return text;
}

function optionalNonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return number;
}

function optionalNonNegativeInteger(value: unknown, label: string) {
  const number = optionalNonNegativeNumber(value, label);

  if (number === null) {
    return null;
  }

  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return number;
}

function savedMealInput(payload: SavedMealPayload) {
  return {
    name: requiredText(payload.name, "Meal name"),
    calories: optionalNonNegativeInteger(payload.calories, "Calories"),
    protein_grams: optionalNonNegativeNumber(payload.proteinGrams, "Protein"),
    carbs_grams: optionalNonNegativeNumber(payload.carbsGrams, "Carbs"),
    fat_grams: optionalNonNegativeNumber(payload.fatGrams, "Fat"),
    fiber_grams: optionalNonNegativeNumber(payload.fiberGrams, "Fiber"),
    notes: optionalText(payload.notes),
  };
}

async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { data, error } = await result.auth.supabase
    .from("saved_meals")
    .select("id, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
    .eq("user_id", result.auth.user.id)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ savedMeals: data ?? [] });
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as SavedMealPayload;
    const { data, error } = await result.auth.supabase
      .from("saved_meals")
      .insert({
        user_id: result.auth.user.id,
        ...savedMealInput(payload),
      })
      .select("id, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ savedMeal: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as SavedMealPayload;
    const { data, error } = await result.auth.supabase
      .from("saved_meals")
      .update({
        ...savedMealInput(payload),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requiredText(payload.id, "Saved meal id"))
      .eq("user_id", result.auth.user.id)
      .select("id, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ savedMeal: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update saved meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as SavedMealPayload;
    const { error } = await result.auth.supabase
      .from("saved_meals")
      .delete()
      .eq("id", requiredText(payload.id, "Saved meal id"))
      .eq("user_id", result.auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove saved meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as SavedMealPayload;
    const savedMealId = requiredText(payload.id, "Saved meal id");
    const { data: savedMeal, error: loadError } = await result.auth.supabase
      .from("saved_meals")
      .select("name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .eq("id", savedMealId)
      .eq("user_id", result.auth.user.id)
      .maybeSingle();

    if (loadError) {
      return NextResponse.json({ error: loadError.message }, { status: 500 });
    }

    if (!savedMeal) {
      return NextResponse.json({ error: "Saved meal was not found." }, { status: 404 });
    }

    const { data, error } = await result.auth.supabase
      .from("meal_logs")
      .insert({
        user_id: result.auth.user.id,
        logged_at: new Date().toISOString(),
        meal_type: "meal",
        ...savedMeal,
      })
      .select("id, logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meal: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to track saved meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
