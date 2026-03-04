import { describe, expect, it } from "vitest";
import { enhancePlanCopy } from "./enhance-plan";
import type { DailyPlan, Goal, PlannerPreferences } from "./types";

const plan: DailyPlan = {
  constrained: false,
  items: [
    {
      type: "goal",
      title: "Ship proposal",
      reason: "Top-priority goal for today.",
      startTime: "09:00",
      endTime: "09:45",
    },
    {
      type: "focus",
      title: "Focus block",
      reason: "Protect 60 minutes for deep work.",
      startTime: "10:00",
      endTime: "11:00",
    },
  ],
};

const goals: Goal[] = [{ title: "Ship proposal", priority: 1 }];

const preferences: PlannerPreferences = {
  workStartTime: "09:00",
  workEndTime: "17:00",
  noMeetingStartTime: null,
  noMeetingEndTime: null,
  focusBlockMinutes: 60,
  workoutPreference: "none",
};

describe("enhancePlanCopy", () => {
  it("returns enhanced copy while preserving times", async () => {
    const result = await enhancePlanCopy({
      plan,
      goals,
      preferences,
      eventsCount: 1,
      generateOutput: async () => ({
        summary: "Strong day with one strategic goal and one focus session.",
        items: [
          { title: "Finalize proposal", reason: "Complete and ship the draft." },
          { title: "Deep focus sprint", reason: "Protect uninterrupted maker time." },
        ],
      }),
    });

    expect(result.warning).toBeUndefined();
    expect(result.summary).toMatch(/strong day/i);
    expect(result.plan.items[0].startTime).toBe("09:00");
    expect(result.plan.items[0].endTime).toBe("09:45");
    expect(result.plan.items[0].title).toBe("Finalize proposal");
  });

  it("falls back cleanly when model call fails", async () => {
    const result = await enhancePlanCopy({
      plan,
      goals,
      preferences,
      eventsCount: 1,
      generateOutput: async () => {
        throw new Error("upstream timeout");
      },
    });

    expect(result.plan).toEqual(plan);
    expect(result.warning).toMatch(/skipped/i);
  });

  it("falls back cleanly on invalid schema", async () => {
    const result = await enhancePlanCopy({
      plan,
      goals,
      preferences,
      eventsCount: 1,
      generateOutput: async () => ({
        summary: "Summary only",
        items: [{ title: "Only one item", reason: "Mismatch length" }],
      }),
    });

    expect(result.plan).toEqual(plan);
    expect(result.warning).toMatch(/invalid/i);
  });

  it("falls back when unsafe language is detected", async () => {
    const result = await enhancePlanCopy({
      plan,
      goals,
      preferences,
      eventsCount: 1,
      generateOutput: async () => ({
        summary: "Push harder with extreme routines.",
        items: [
          { title: "Extreme cut", reason: "Try an extreme calorie deficit." },
          { title: "Sleep reduction", reason: "Skip sleep for more output." },
        ],
      }),
    });

    expect(result.plan).toEqual(plan);
    expect(result.warning).toMatch(/unsafe/i);
  });
});
