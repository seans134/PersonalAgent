import { describe, expect, it } from "vitest";
import { computeHabitMetrics, enumerateDays, localDateKey, shiftDate } from "./metrics";
import type { HabitMealLog, HabitWorkoutLog } from "./types";

describe("date helpers", () => {
  it("shiftDate walks calendar days and crosses months", () => {
    expect(shiftDate("2026-09-07", -1)).toBe("2026-09-06");
    expect(shiftDate("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDate("2026-09-07", 0)).toBe("2026-09-07");
  });

  it("enumerateDays returns the window oldest-first, inclusive", () => {
    expect(enumerateDays("2026-09-07", 7)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);
    expect(enumerateDays("2026-09-07", 1)).toEqual(["2026-09-07"]);
  });

  it("localDateKey buckets an instant into its local calendar day", () => {
    // 02:00 UTC on the 8th is still the 7th in Toronto (UTC-4 in September).
    expect(localDateKey("2026-09-08T02:00:00Z", "America/Toronto")).toBe("2026-09-07");
    expect(localDateKey("2026-09-08T02:00:00Z", "UTC")).toBe("2026-09-08");
    expect(localDateKey("not-a-date", "UTC")).toBeNull();
  });
});

const meals: HabitMealLog[] = [
  { logged_at: "2026-09-07T12:00:00Z", calories: 600, protein_grams: 40, carbs_grams: 50, fat_grams: 20, fiber_grams: 5 },
  { logged_at: "2026-09-07T18:00:00Z", calories: 700, protein_grams: 50, carbs_grams: 60, fat_grams: 25, fiber_grams: 6 },
  { logged_at: "2026-09-06T12:00:00Z", calories: 500, protein_grams: 45, carbs_grams: 40, fat_grams: 15, fiber_grams: 4 },
  { logged_at: "2026-09-05T12:00:00Z", calories: 2000, protein_grams: 30, carbs_grams: 200, fat_grams: 80, fiber_grams: 10 },
];

const workouts: HabitWorkoutLog[] = [
  { logged_at: "2026-09-07T07:00:00Z", workout_type: "strength", duration_minutes: 45, intensity: "moderate" },
  { logged_at: "2026-09-05T07:00:00Z", workout_type: "cardio", duration_minutes: 30, intensity: "intense" },
];

describe("computeHabitMetrics — weekly window with targets", () => {
  const metrics = computeHabitMetrics({
    meals,
    workouts,
    targets: { calorieTarget: 1300, proteinTarget: 50 },
    range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
  });

  it("reports the range bounds", () => {
    expect(metrics.range).toEqual({ startDate: "2026-09-01", endDate: "2026-09-07", days: 7 });
  });

  it("aggregates nutrition over logged days only", () => {
    expect(metrics.nutrition.daysLogged).toBe(3);
    expect(metrics.nutrition.loggingConsistency).toBe(0.43);
    expect(metrics.nutrition.avgCalories).toBe(1266.7);
    expect(metrics.nutrition.avgProtein).toBe(55);
  });

  it("counts target adherence within the ±15% band", () => {
    expect(metrics.nutrition.calorieAdherenceDays).toBe(1);
    expect(metrics.nutrition.proteinTargetHitDays).toBe(1);
  });

  it("summarizes workouts", () => {
    expect(metrics.workouts.sessions).toBe(2);
    expect(metrics.workouts.daysWithWorkout).toBe(2);
    expect(metrics.workouts.restDays).toBe(5);
    expect(metrics.workouts.activeMinutes).toBe(75);
    expect(metrics.workouts.daysSinceLastWorkout).toBe(0);
    expect(metrics.workouts.sessionsPerWeek).toBe(2);
    expect(metrics.workouts.typeBalance).toEqual({ strength: 1, cardio: 1, recovery: 0, sport: 0 });
    expect(metrics.workouts.intensityDistribution).toEqual({ light: 0, moderate: 1, intense: 1 });
  });

  it("computes streaks ending at endDate", () => {
    expect(metrics.streaks.loggingStreak).toBe(3);
    expect(metrics.streaks.workoutStreak).toBe(1);
    expect(metrics.streaks.proteinTargetStreak).toBe(1);
  });
});

describe("computeHabitMetrics — edge cases", () => {
  it("nulls target-derived metrics and zeroes protein streak without targets", () => {
    const metrics = computeHabitMetrics({
      meals,
      workouts,
      targets: { calorieTarget: null, proteinTarget: null },
      range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
    });
    expect(metrics.nutrition.calorieAdherenceDays).toBeNull();
    expect(metrics.nutrition.proteinTargetHitDays).toBeNull();
    expect(metrics.streaks.proteinTargetStreak).toBe(0);
  });

  it("returns null averages and null daysSinceLastWorkout when the window is empty", () => {
    const metrics = computeHabitMetrics({
      meals: [],
      workouts: [],
      targets: { calorieTarget: 2000, proteinTarget: 120 },
      range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
    });
    expect(metrics.nutrition.daysLogged).toBe(0);
    expect(metrics.nutrition.avgCalories).toBeNull();
    expect(metrics.nutrition.calorieAdherenceDays).toBe(0);
    expect(metrics.workouts.daysSinceLastWorkout).toBeNull();
    expect(metrics.streaks.loggingStreak).toBe(0);
    expect(metrics.nutrition.perDay).toHaveLength(7);
  });

  it("measures days since the last workout when endDate is a rest day", () => {
    const metrics = computeHabitMetrics({
      meals: [],
      workouts: [
        { logged_at: "2026-09-05T07:00:00Z", workout_type: "strength", duration_minutes: 40, intensity: "moderate" },
      ],
      targets: { calorieTarget: null, proteinTarget: null },
      range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
    });
    expect(metrics.workouts.daysSinceLastWorkout).toBe(2);
  });

  it("ignores logs outside the window", () => {
    const metrics = computeHabitMetrics({
      meals: [
        { logged_at: "2026-08-20T12:00:00Z", calories: 999, protein_grams: 99, carbs_grams: 0, fat_grams: 0, fiber_grams: 0 },
      ],
      workouts: [],
      targets: { calorieTarget: null, proteinTarget: null },
      range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
    });
    expect(metrics.nutrition.daysLogged).toBe(0);
  });
});
