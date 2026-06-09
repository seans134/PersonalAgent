import { describe, expect, it } from "vitest";
import {
  parseNaturalLanguageWorkoutSchedule,
  parseNaturalLanguageWorkout,
  validateNaturalLanguageWorkoutScheduleDraft,
  validateNaturalLanguageWorkoutDraft,
} from "./natural-language-workout";

describe("validateNaturalLanguageWorkoutDraft", () => {
  it("normalizes a cardio distance workout", () => {
    const draft = validateNaturalLanguageWorkoutDraft({
      logged_at: "2026-06-09T08:00:00-04:00",
      workout_type: "cardio",
      tracking_method: "distance_time",
      title: "Morning run",
      duration_minutes: 28,
      intensity: "moderate",
      calories_burned: 320,
      metrics: {
        distance: 3,
        distance_unit: "mi",
      },
      notes: "Felt smooth",
      warnings: [],
    });

    expect(draft.workout_type).toBe("cardio");
    expect(draft.tracking_method).toBe("distance_time");
    expect(draft.duration_minutes).toBe(28);
    expect(draft.metrics).toEqual({ distance: 3, distance_unit: "mi" });
  });

  it("defaults invalid method to the first valid method for the workout type", () => {
    const draft = validateNaturalLanguageWorkoutDraft({
      workout_type: "cardio",
      tracking_method: "sets_reps_weight",
      title: "Bike ride",
      duration_minutes: 45,
      intensity: "intense",
      metrics: {
        distance: 12,
      },
      warnings: [],
    });

    expect(draft.tracking_method).toBe("distance_time");
    expect(draft.metrics).toEqual({ distance: 12, distance_unit: "mi" });
  });

  it("throws when required title or duration are missing", () => {
    expect(() =>
      validateNaturalLanguageWorkoutDraft({
        workout_type: "strength",
        tracking_method: "sets_reps_weight",
        duration_minutes: 30,
      }),
    ).toThrow(/title/i);

    expect(() =>
      validateNaturalLanguageWorkoutDraft({
        workout_type: "strength",
        tracking_method: "sets_reps_weight",
        title: "Lift",
      }),
    ).toThrow(/duration/i);
  });
});

describe("parseNaturalLanguageWorkout", () => {
  it("uses injected generation and validates the response", async () => {
    const draft = await parseNaturalLanguageWorkout({
      text: "I did 3 sets of 10 push-ups for 15 minutes.",
      generateOutput: async () => ({
        workout_type: "strength",
        tracking_method: "bodyweight_sets",
        title: "Push-ups",
        duration_minutes: 15,
        intensity: "moderate",
        metrics: {
          exercise_name: "Push-ups",
          sets: 3,
          reps: 10,
        },
        warnings: [],
      }),
    });

    expect(draft.title).toBe("Push-ups");
    expect(draft.metrics).toEqual({
      exercise_name: "Push-ups",
      sets: 3,
      reps: 10,
    });
  });
});

describe("validateNaturalLanguageWorkoutScheduleDraft", () => {
  it("normalizes multiple planned workout items", () => {
    const draft = validateNaturalLanguageWorkoutScheduleDraft({
      items: [
        {
          day_of_week: 1,
          workout_type: "strength",
          tracking_method: "sets_reps_weight",
          title: "Upper body",
          duration_minutes: 45,
          metrics: {
            sets: 3,
            reps: 10,
            weight: 135,
            weight_unit: "lb",
          },
        },
        {
          day_of_week: 3,
          workout_type: "cardio",
          tracking_method: "time_only",
          title: "Easy run",
          duration_minutes: 30,
          metrics: {},
        },
      ],
      warnings: [],
    });

    expect(draft.items).toHaveLength(2);
    expect(draft.items[0].duration_minutes).toBeNull();
    expect(draft.items[0].metrics).toEqual({
      exercise_name: null,
      sets: 3,
      reps: 10,
      weight: 135,
      weight_unit: "lb",
    });
    expect(draft.items[1].duration_minutes).toBe(30);
  });

  it("drops planned workout items with invalid days", () => {
    const draft = validateNaturalLanguageWorkoutScheduleDraft({
      items: [
        {
          day_of_week: 8,
          workout_type: "cardio",
          tracking_method: "time_only",
          title: "Run",
          duration_minutes: 30,
          metrics: {},
        },
      ],
      warnings: [],
    });

    expect(draft.items).toEqual([]);
    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/weekday/i)]));
  });
});

describe("parseNaturalLanguageWorkoutSchedule", () => {
  it("uses injected generation and validates the response", async () => {
    const draft = await parseNaturalLanguageWorkoutSchedule({
      text: "Monday upper body and Wednesday run.",
      generateOutput: async () => ({
        items: [
          {
            day_of_week: 1,
            workout_type: "strength",
            tracking_method: "bodyweight_sets",
            title: "Upper body",
            duration_minutes: null,
            metrics: {
              sets: 3,
              reps: 12,
            },
          },
        ],
        warnings: [],
      }),
    });

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].day_of_week).toBe(1);
  });
});
