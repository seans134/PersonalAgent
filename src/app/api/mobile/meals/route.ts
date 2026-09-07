import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { computeRecentNudges } from "@/lib/tracking/habit-report-request";

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack", "meal"]);

type MealPayload = {
  id?: unknown;
  name?: unknown;
  mealType?: unknown;
  calories?: unknown;
  proteinGrams?: unknown;
  carbsGrams?: unknown;
  fatGrams?: unknown;
  fiberGrams?: unknown;
  notes?: unknown;
};

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

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

function mealInput(payload: MealPayload) {
  const mealType = typeof payload.mealType === "string" && MEAL_TYPES.has(payload.mealType)
    ? payload.mealType
    : "meal";

  return {
    meal_type: mealType,
    name: requiredText(payload.name, "Meal name"),
    calories: optionalNonNegativeInteger(payload.calories, "Calories"),
    protein_grams: optionalNonNegativeNumber(payload.proteinGrams, "Protein"),
    carbs_grams: optionalNonNegativeNumber(payload.carbsGrams, "Carbs"),
    fat_grams: optionalNonNegativeNumber(payload.fatGrams, "Fat"),
    fiber_grams: optionalNonNegativeNumber(payload.fiberGrams, "Fiber"),
    notes: optionalText(payload.notes),
  };
}

function mealId(payload: MealPayload) {
  return requiredText(payload.id, "Meal id");
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { start, end } = todayBounds();
  const { data, error } = await auth.supabase
    .from("meal_logs")
    .select("id, logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
    .eq("user_id", auth.user.id)
    .gte("logged_at", start.toISOString())
    .lte("logged_at", end.toISOString())
    .order("logged_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meals: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as MealPayload;
    const { data, error } = await auth.supabase
      .from("meal_logs")
      .insert({
        user_id: auth.user.id,
        logged_at: new Date().toISOString(),
        ...mealInput(payload),
      })
      .select("id, logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nudges = await computeRecentNudges({ supabase: auth.supabase, userId: auth.user.id, focus: "meal" });
    return NextResponse.json({ meal: data, nudges }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to log meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as MealPayload;
    const { data, error } = await auth.supabase
      .from("meal_logs")
      .update(mealInput(payload))
      .eq("id", mealId(payload))
      .eq("user_id", auth.user.id)
      .select("id, logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meal: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as MealPayload;
    const { error } = await auth.supabase
      .from("meal_logs")
      .delete()
      .eq("id", mealId(payload))
      .eq("user_id", auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove meal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
