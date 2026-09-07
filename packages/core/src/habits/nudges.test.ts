import { describe, expect, it } from "vitest";
import { computeNudges } from "./nudges";
import type { HabitMetrics } from "./types";

function makeMetrics(overrides: {
  nutrition?: Partial<HabitMetrics["nutrition"]>;
  workouts?: Partial<HabitMetrics["workouts"]>;
  streaks?: Partial<HabitMetrics["streaks"]>;
  days?: number;
}): HabitMetrics {
  const days = overrides.days ?? 7;
  return {
    range: { startDate: "2026-09-01", endDate: "2026-09-07", days },
    nutrition: {
      daysLogged: 0,
      loggingConsistency: 0,
      avgCalories: null,
      avgProtein: null,
      avgCarbs: null,
      avgFat: null,
      avgFiber: null,
      calorieTarget: null,
      proteinTarget: null,
      calorieAdherenceDays: null,
      proteinTargetHitDays: null,
      perDay: [],
      ...overrides.nutrition,
    },
    workouts: {
      sessions: 0,
      sessionsPerWeek: 0,
      activeMinutes: 0,
      daysWithWorkout: 0,
      restDays: days,
      daysSinceLastWorkout: null,
      typeBalance: { strength: 0, cardio: 0, recovery: 0, sport: 0 },
      intensityDistribution: { light: 0, moderate: 0, intense: 0 },
      perDay: [],
      ...overrides.workouts,
    },
    streaks: {
      loggingStreak: 0,
      workoutStreak: 0,
      proteinTargetStreak: 0,
      ...overrides.streaks,
    },
  };
}

function ids(metrics: HabitMetrics): string[] {
  return computeNudges(metrics).map((nudge) => nudge.id);
}

describe("computeNudges — endorsements", () => {
  it("celebrates a logging streak of 3+", () => {
    const nudges = computeNudges(makeMetrics({ streaks: { loggingStreak: 4 } }));
    const logging = nudges.find((n) => n.id === "logging-streak");
    expect(logging?.tone).toBe("positive");
    expect(logging?.message).toContain("4 days");
  });

  it("celebrates workout and protein streaks", () => {
    expect(ids(makeMetrics({ streaks: { workoutStreak: 3 } }))).toContain("workout-streak");
    expect(ids(makeMetrics({ streaks: { proteinTargetStreak: 5 } }))).toContain("protein-streak");
  });

  it("endorses a fully-logged week and balanced training", () => {
    const nudges = ids(
      makeMetrics({
        nutrition: { loggingConsistency: 1, daysLogged: 7 },
        workouts: { typeBalance: { strength: 2, cardio: 1, recovery: 1, sport: 0 } },
      }),
    );
    expect(nudges).toContain("full-week-logged");
    expect(nudges).toContain("balanced-training");
  });

  it("does not celebrate streaks below the threshold", () => {
    const nudges = computeNudges(makeMetrics({ streaks: { loggingStreak: 2, workoutStreak: 2 } }));
    expect(nudges.every((nudge) => nudge.tone !== "positive")).toBe(true);
    expect(nudges.map((n) => n.id)).not.toContain("logging-streak");
    expect(nudges.map((n) => n.id)).not.toContain("workout-streak");
  });
});

describe("computeNudges — improvements", () => {
  it("nudges after a workout gap", () => {
    const nudges = computeNudges(makeMetrics({ workouts: { daysSinceLastWorkout: 3, sessions: 1 } }));
    const gap = nudges.find((n) => n.id === "workout-gap");
    expect(gap?.tone).toBe("improve");
    expect(gap?.message).toContain("3 days");
  });

  it("flags low average protein against target", () => {
    expect(
      ids(makeMetrics({ nutrition: { proteinTarget: 120, avgProtein: 80, daysLogged: 5, loggingConsistency: 0.7 } })),
    ).toContain("protein-low");
  });

  it("flags average calories running above target", () => {
    expect(
      ids(makeMetrics({ nutrition: { calorieTarget: 2000, avgCalories: 2400, daysLogged: 5, loggingConsistency: 0.7 } })),
    ).toContain("calories-high");
  });

  it("flags spotty logging", () => {
    expect(ids(makeMetrics({ nutrition: { loggingConsistency: 0.3 }, days: 7 }))).toContain("logging-gaps");
  });

  it("suggests a rest day when training every day with no rest", () => {
    expect(
      ids(makeMetrics({ workouts: { sessions: 7, daysWithWorkout: 7, restDays: 0, daysSinceLastWorkout: 0 } })),
    ).toContain("no-rest-day");
  });
});

describe("computeNudges — ordering", () => {
  it("puts positives first, then honors focus and limit", () => {
    const metrics = makeMetrics({
      streaks: { loggingStreak: 4 },
      workouts: { daysSinceLastWorkout: 3, sessions: 1 },
    });
    const all = computeNudges(metrics);
    expect(all[0].tone).toBe("positive");

    const focused = computeNudges(metrics, { focus: "workout", limit: 1 });
    expect(focused).toHaveLength(1);
    expect(focused[0].metric).toBe("workout");
  });
});
