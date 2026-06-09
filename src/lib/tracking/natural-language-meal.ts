import { isGeminiConfigured, requestMealParse } from "@/lib/gemini/client";
import type { MealLogInput, MealType, SavedMealInput } from "./types";

export type NaturalLanguageMealMode = "log" | "saved";

export type NaturalLanguageMealDraft =
  | (MealLogInput & {
      mode: "log";
      warnings: string[];
    })
  | (SavedMealInput & {
      mode: "saved";
      warnings: string[];
    });

export type ParseNaturalLanguageMealInput = {
  mode: NaturalLanguageMealMode;
  text: string;
  timezone?: string;
  generateOutput?: (input: { mode: NaturalLanguageMealMode; text: string; timezone: string }) => Promise<unknown>;
};

const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner", "snack", "meal"]);

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNonNegativeInteger(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    warnings.push(`${label} was ignored because it was not a non-negative whole number.`);
    return null;
  }

  return value;
}

function optionalNonNegativeNumber(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    warnings.push(`${label} was ignored because it was not a non-negative number.`);
    return null;
  }

  return value;
}

function normalizeMealType(value: unknown): MealType {
  return typeof value === "string" && MEAL_TYPES.has(value as MealType) ? (value as MealType) : "meal";
}

function normalizeLoggedAt(value: unknown, warnings: string[]): string {
  const text = optionalString(value);
  if (!text) {
    return new Date().toISOString();
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    warnings.push("Logged time was ignored because it was not a valid date/time.");
    return new Date().toISOString();
  }

  return date.toISOString();
}

export function validateNaturalLanguageMealDraft(
  value: unknown,
  mode: NaturalLanguageMealMode,
): NaturalLanguageMealDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Meal parser payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim())
    : [];
  const name = optionalString(parsed.name);

  if (!name) {
    throw new Error("Meal name is required.");
  }

  const base = {
    name: name.slice(0, 160),
    calories: optionalNonNegativeInteger(parsed.calories, "Calories", warnings),
    protein_grams: optionalNonNegativeNumber(parsed.protein_grams, "Protein", warnings),
    carbs_grams: optionalNonNegativeNumber(parsed.carbs_grams, "Carbs", warnings),
    fat_grams: optionalNonNegativeNumber(parsed.fat_grams, "Fat", warnings),
    fiber_grams: optionalNonNegativeNumber(parsed.fiber_grams, "Fiber", warnings),
    notes: optionalString(parsed.notes)?.slice(0, 500) ?? null,
    warnings: warnings.filter(Boolean),
  };

  if (mode === "saved") {
    return {
      mode,
      ...base,
    };
  }

  return {
    mode,
    logged_at: normalizeLoggedAt(parsed.logged_at, warnings),
    meal_type: normalizeMealType(parsed.meal_type),
    ...base,
  };
}

export async function parseNaturalLanguageMeal(input: ParseNaturalLanguageMealInput): Promise<NaturalLanguageMealDraft> {
  const text = input.text.trim();
  const timezone = input.timezone ?? "America/Toronto";

  if (text.length < 8) {
    throw new Error("Add a little more meal detail before parsing.");
  }

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Meal parser skipped: GEMINI_API_KEY not configured.");
      }

      return requestMealParse({ mode: input.mode, text, timezone });
    });

  const raw = await generate({ mode: input.mode, text, timezone });
  return validateNaturalLanguageMealDraft(raw, input.mode);
}
