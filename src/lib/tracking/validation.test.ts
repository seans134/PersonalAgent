import { describe, expect, it } from "vitest";
import {
  parseBodyProfileLogFormData,
  parseMealLogFormData,
  parseMealLogUpdateFormData,
  parseSavedMealFormData,
  parseWorkoutLogFormData,
} from "./validation";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("tracking validation", () => {
  it("parses meal logs with optional macro fields", () => {
    const parsed = parseMealLogFormData(
      form({
        name: "Greek yogurt bowl",
        meal_type: "breakfast",
        calories: "420",
        protein_grams: "31.5",
        fiber_grams: "7.2",
        notes: "Post-workout",
      }),
    );

    expect(parsed.name).toBe("Greek yogurt bowl");
    expect(parsed.meal_type).toBe("breakfast");
    expect(parsed.calories).toBe(420);
    expect(parsed.protein_grams).toBe(31.5);
    expect(parsed.carbs_grams).toBeNull();
    expect(parsed.fiber_grams).toBe(7.2);
    expect(parsed.notes).toBe("Post-workout");
  });

  it("rejects meal logs without a name", () => {
    expect(() => parseMealLogFormData(form({ calories: "100" }))).toThrow(/meal name/i);
  });

  it("parses meal log updates without changing logged time", () => {
    const parsed = parseMealLogUpdateFormData(
      form({
        name: "Turkey sandwich",
        calories: "610",
        protein_grams: "42",
      }),
    );

    expect(parsed).toEqual({
      name: "Turkey sandwich",
      calories: 610,
      protein_grams: 42,
      carbs_grams: null,
      fat_grams: null,
      fiber_grams: null,
      notes: null,
    });
  });

  it("parses saved meals using reusable meal fields", () => {
    const parsed = parseSavedMealFormData(
      form({
        name: "Chicken rice bowl",
        calories: "720",
        carbs_grams: "78.5",
        fat_grams: "18",
        fiber_grams: "9",
      }),
    );

    expect(parsed.name).toBe("Chicken rice bowl");
    expect(parsed.calories).toBe(720);
    expect(parsed.carbs_grams).toBe(78.5);
    expect(parsed.fat_grams).toBe(18);
    expect(parsed.fiber_grams).toBe(9);
  });

  it("parses workout logs with typed defaults", () => {
    const parsed = parseWorkoutLogFormData(
      form({
        title: "Upper body",
        duration_minutes: "55",
      }),
    );

    expect(parsed.title).toBe("Upper body");
    expect(parsed.duration_minutes).toBe(55);
    expect(parsed.workout_type).toBe("other");
    expect(parsed.intensity).toBe("moderate");
  });

  it("rejects invalid workout durations", () => {
    expect(() =>
      parseWorkoutLogFormData(
        form({
          title: "Run",
          duration_minutes: "0",
        }),
      ),
    ).toThrow(/duration/i);
  });

  it("parses body profile logs when at least one metric is present", () => {
    const parsed = parseBodyProfileLogFormData(
      form({
        weight_kg: "82.4",
        body_fat_percentage: "18.5",
      }),
    );

    expect(parsed.weight_kg).toBe(82.4);
    expect(parsed.body_fat_percentage).toBe(18.5);
    expect(parsed.height_cm).toBeNull();
  });

  it("rejects empty body profile logs", () => {
    expect(() => parseBodyProfileLogFormData(form({ notes: "No metrics" }))).toThrow(/at least one/i);
  });
});
