import { describe, expect, it } from "vitest";
import { suggestMeal, validateMealSuggestionDraft, validateMealSuggestionResult } from "./meal-suggestions";

describe("validateMealSuggestionDraft", () => {
  it("normalizes a safe meal suggestion", () => {
    const draft = validateMealSuggestionDraft({
      logged_at: "2026-06-11T18:00:00-04:00",
      meal_type: "dinner",
      name: "Chicken rice bowl",
      calories: 650,
      protein_grams: 42,
      carbs_grams: 70,
      fat_grams: 18,
      fiber_grams: 6,
      notes: "Uses a meal the user has logged before.",
      suggestion_reason: "Fits after today's planned strength workout and matches recent meals.",
      suggested_timing: "After training",
      target_alignment: "Adds protein and carbs to support the user's fitness goal today.",
      agent_reply: "This is a solid post-training meal option.",
      warnings: [],
    });

    expect(draft.mode).toBe("log");
    expect(draft.name).toBe("Chicken rice bowl");
    expect(draft.suggestion_reason).toMatch(/strength workout/i);
    expect(draft.suggested_timing).toBe("After training");
    expect(draft.target_alignment).toMatch(/protein/i);
    expect(draft.agent_reply).toMatch(/post-training/i);
  });

  it("allows protective nutrition language", () => {
    const draft = validateMealSuggestionDraft({
      logged_at: "2026-06-11T12:00:00-04:00",
      meal_type: "lunch",
      name: "Chicken rice bowl",
      calories: 620,
      protein_grams: 42,
      carbs_grams: 68,
      fat_grams: 16,
      fiber_grams: 6,
      notes: "A steady meal with no guilt or restriction attached.",
      suggestion_reason: "Fits lunch and supports training later.",
      suggested_timing: "Lunch",
      target_alignment: "Adds protein and carbs toward the user's goal.",
      warnings: [],
    });

    expect(draft.notes).toMatch(/no guilt/i);
  });
});

describe("suggestMeal", () => {
  it("uses injected generation and validates the response", async () => {
    const result = await suggestMeal({
      timezone: "America/Toronto",
      today: "2026-06-11",
      currentTimeContext: {
        currentIso: "2026-06-11T22:11:00.000Z",
        currentLocalDate: "2026-06-11",
        currentLocalTime: "18:11",
        timezone: "America/Toronto",
      },
      profile: null,
      latestBodyProfile: { height_cm: 178, weight_kg: 75, maintenance_calories: null },
      nutritionContext: {
        todayTotals: { calories: 400, protein_grams: 20, carbs_grams: 45, fat_grams: 12, fiber_grams: 5 },
        mealsLoggedToday: 1,
        fitnessGoals: [{ title: "Build muscle", task_type: "fitness" }],
      },
      goals: [],
      todayMeals: [],
      recentMeals: [],
      savedMeals: [],
      todayWorkouts: [{ title: "Run", duration_minutes: 30 }],
      todayEvents: [{ title: "Class", startTime: "10:00", endTime: "11:00", source: "schedule" }],
      generateOutput: async () => ({
        logged_at: "2026-06-11T12:00:00-04:00",
        meal_type: "lunch",
        name: "Turkey sandwich and fruit",
        calories: null,
        protein_grams: null,
        carbs_grams: null,
        fat_grams: null,
        fiber_grams: null,
        notes: "Simple lunch between class and training.",
        suggestion_reason: "Fits the open midday window and gives a practical pre-training option.",
        suggested_timing: "Midday",
        target_alignment: "Adds a moderate meal toward the user's muscle-building goal.",
        agent_reply: "This gives you a practical midday option before training.",
        warnings: [],
      }),
    });

    expect(result.draft?.name).toBe("Turkey sandwich and fruit");
    expect(result.draft?.suggestion_reason).toMatch(/pre-training/i);
    expect(result.draft?.target_alignment).toMatch(/muscle/i);
  });

  it("allows no meal suggestion when nothing is needed", () => {
    const result = validateMealSuggestionResult({
      should_suggest: false,
      suggestion: null,
      agent_reply: "You look covered for now, so I would wait until you are actually hungry.",
      warnings: [],
    });

    expect(result.draft).toBeNull();
    expect(result.agent_reply).toMatch(/covered/i);
  });

  it("turns unsafe meal output into a positive no-suggestion reply", () => {
    const result = validateMealSuggestionResult({
      should_suggest: true,
      agent_reply: "A detox cleanse after lunch would reset the day.",
      suggestion: {
        logged_at: "2026-06-11T12:00:00-04:00",
        meal_type: "lunch",
        name: "Detox cleanse",
        calories: null,
        protein_grams: null,
        carbs_grams: null,
        fat_grams: null,
        fiber_grams: null,
        notes: null,
        suggestion_reason: "A detox cleanse after lunch.",
      },
      warnings: ["Detox recommended."],
    });

    expect(result.draft).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.agent_reply).toMatch(/normal meal or snack/i);
  });
});
