import { describe, expect, it } from "vitest";
import {
  parseNaturalLanguageMeal,
  validateNaturalLanguageMealDraft,
} from "./natural-language-meal";

describe("validateNaturalLanguageMealDraft", () => {
  it("normalizes a meal log draft", () => {
    const draft = validateNaturalLanguageMealDraft(
      {
        logged_at: "2026-06-09T12:30:00-04:00",
        meal_type: "lunch",
        name: "Chicken rice bowl",
        calories: 650,
        protein_grams: 42,
        carbs_grams: 70,
        fat_grams: 18,
        fiber_grams: 6,
        notes: "Usual order",
        warnings: [],
      },
      "log",
    );

    expect(draft.mode).toBe("log");
    expect(draft.name).toBe("Chicken rice bowl");
    expect(draft.calories).toBe(650);
    expect(draft.protein_grams).toBe(42);
  });

  it("normalizes a saved meal draft without log-only fields", () => {
    const draft = validateNaturalLanguageMealDraft(
      {
        meal_type: "dinner",
        name: "Protein oats",
        calories: 440,
        protein_grams: 35,
        warnings: [],
      },
      "saved",
    );

    expect(draft.mode).toBe("saved");
    expect(draft.name).toBe("Protein oats");
    expect("logged_at" in draft).toBe(false);
    expect("meal_type" in draft).toBe(false);
  });

  it("drops invalid nutrition fields with warnings", () => {
    const draft = validateNaturalLanguageMealDraft(
      {
        name: "Snack",
        calories: 220.5,
        protein_grams: -5,
        warnings: [],
      },
      "saved",
    );

    expect(draft.calories).toBeNull();
    expect(draft.protein_grams).toBeNull();
    expect(draft.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/calories/i), expect.stringMatching(/protein/i)]),
    );
  });
});

describe("parseNaturalLanguageMeal", () => {
  it("uses injected generation and validates the response", async () => {
    const draft = await parseNaturalLanguageMeal({
      mode: "log",
      text: "Lunch was a chicken rice bowl, about 650 calories.",
      generateOutput: async () => ({
        meal_type: "lunch",
        name: "Chicken rice bowl",
        calories: 650,
        protein_grams: null,
        carbs_grams: null,
        fat_grams: null,
        fiber_grams: null,
        notes: null,
        warnings: ["Nutrition is estimated."],
      }),
    });

    expect(draft.mode).toBe("log");
    expect(draft.name).toBe("Chicken rice bowl");
    expect(draft.warnings[0]).toMatch(/estimated/i);
  });
});
