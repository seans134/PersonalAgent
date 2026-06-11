import { describe, expect, it } from "vitest";
import { suggestWorkout, validateWorkoutSuggestionDraft, validateWorkoutSuggestionResult } from "./workout-suggestions";

describe("validateWorkoutSuggestionDraft", () => {
  it("normalizes a safe workout suggestion", () => {
    const draft = validateWorkoutSuggestionDraft({
      logged_at: "2026-06-11T17:30:00-04:00",
      workout_type: "strength",
      tracking_method: "bodyweight_sets",
      title: "Upper body bodyweight circuit",
      duration_minutes: 30,
      intensity: "moderate",
      calories_burned: null,
      metrics: {
        exercise_name: "Push-ups",
        sets: 3,
        reps: 12,
      },
      notes: "Keep the pace steady and stop if anything feels off.",
      suggestion_reason: "Fits the open evening window and avoids stacking intense cardio after yesterday's run.",
      suggested_timing: "After class",
      target_alignment: "Supports the user's muscle-building goal with a manageable strength session.",
      agent_reply: "This gives you strength work without piling on more cardio today.",
      warnings: [],
    });

    expect(draft.title).toBe("Upper body bodyweight circuit");
    expect(draft.tracking_method).toBe("bodyweight_sets");
    expect(draft.suggestion_reason).toMatch(/evening window/i);
    expect(draft.target_alignment).toMatch(/muscle-building/i);
    expect(draft.agent_reply).toMatch(/strength work/i);
  });

  it("allows protective safety language", () => {
    const draft = validateWorkoutSuggestionDraft({
      logged_at: "2026-06-11T17:30:00-04:00",
      workout_type: "mobility",
      tracking_method: "time_only",
      title: "Easy mobility reset",
      duration_minutes: 15,
      intensity: "light",
      calories_burned: null,
      metrics: {},
      notes: "Do not push through pain; stop if anything feels off.",
      suggestion_reason: "Keeps movement light after a harder session.",
      suggested_timing: "Tonight",
      target_alignment: "Supports consistency without adding heavy fatigue.",
      warnings: [],
    });

    expect(draft.notes).toMatch(/do not push through pain/i);
  });
});

describe("suggestWorkout", () => {
  it("uses injected generation and validates the response", async () => {
    const result = await suggestWorkout({
      timezone: "America/Toronto",
      today: "2026-06-11",
      currentTimeContext: {
        currentIso: "2026-06-11T22:11:00.000Z",
        currentLocalDate: "2026-06-11",
        currentLocalTime: "18:11",
        timezone: "America/Toronto",
      },
      profile: { workout_preference: "moderate" },
      latestBodyProfile: { height_cm: 178, weight_kg: 75 },
      fitnessContext: {
        fitnessGoals: [{ title: "Build muscle", task_type: "fitness" }],
        workoutPreference: "moderate",
      },
      goals: [],
      todayWorkouts: [],
      recentWorkouts: [{ title: "Easy run", workout_type: "cardio" }],
      plannedWorkouts: [],
      todayMeals: [{ name: "Oats", protein_grams: 25 }],
      nutritionContext: { todayTotals: { calories: 500, protein_grams: 25 } },
      todayEvents: [{ title: "Class", startTime: "10:00", endTime: "11:00", source: "schedule" }],
      generateOutput: async () => ({
        logged_at: "2026-06-11T16:00:00-04:00",
        workout_type: "strength",
        tracking_method: "bodyweight_sets",
        title: "Bodyweight strength session",
        duration_minutes: 25,
        intensity: "moderate",
        calories_burned: null,
        metrics: {
          exercise_name: "Squats",
          sets: 3,
          reps: 12,
        },
        notes: "Short strength work that fits after class.",
        suggestion_reason: "Fits the schedule and balances recent cardio with strength.",
        suggested_timing: "Late afternoon",
        target_alignment: "Supports the user's muscle-building goal.",
        agent_reply: "This balances your recent cardio with strength.",
        warnings: [],
      }),
    });

    expect(result.draft?.workout_type).toBe("strength");
    expect(result.draft?.title).toBe("Bodyweight strength session");
    expect(result.draft?.target_alignment).toMatch(/muscle/i);
  });

  it("allows no workout suggestion when recovery is the better call", () => {
    const result = validateWorkoutSuggestionResult({
      should_suggest: false,
      suggestion: null,
      agent_reply: "You already hit hypertrophy today, so I would recover instead of stacking another similar session.",
      warnings: [],
    });

    expect(result.draft).toBeNull();
    expect(result.agent_reply).toMatch(/recover/i);
  });

  it("turns unsafe workout output into a positive no-suggestion reply", () => {
    const result = validateWorkoutSuggestionResult({
      should_suggest: true,
      agent_reply: "Push through pain for faster progress.",
      suggestion: {
        logged_at: "2026-06-11T17:30:00-04:00",
        workout_type: "cardio",
        tracking_method: "time_only",
        title: "No rest sprint session",
        duration_minutes: 60,
        intensity: "intense",
        calories_burned: null,
        metrics: {},
        notes: "Ignore pain and keep going.",
        suggestion_reason: "Push through pain for faster progress.",
        suggested_timing: "Tonight",
        target_alignment: null,
      },
      warnings: ["Ignore pain."],
    });

    expect(result.draft).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.agent_reply).toMatch(/skip adding another workout/i);
  });
});
