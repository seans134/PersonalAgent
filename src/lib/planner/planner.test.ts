import { describe, expect, it } from "vitest";
import { generateDailyPlan } from "./planner";
import type { CalendarEvent, Goal, PlannerPreferences } from "./types";

const basePreferences: PlannerPreferences = {
  workStartTime: "09:00",
  workEndTime: "17:00",
  noMeetingStartTime: null,
  noMeetingEndTime: null,
  focusBlockMinutes: 60,
  workoutPreference: "moderate",
};

const baseGoals: Goal[] = [
  { title: "Ship proposal", priority: 1 },
  { title: "Read architecture notes", priority: 2 },
];

function overlaps(event: CalendarEvent, item: { startTime: string; endTime: string }) {
  return !(item.endTime <= event.startTime || item.startTime >= event.endTime);
}

describe("generateDailyPlan", () => {
  it("avoids overlap with calendar events", () => {
    const calendarEvents: CalendarEvent[] = [
      { id: "a", startTime: "09:00", endTime: "10:30" },
      { id: "b", startTime: "12:00", endTime: "13:00" },
    ];

    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: basePreferences,
      calendarEvents,
    });

    const planned = plan.items.filter((item) => item.type !== "fallback");

    for (const item of planned) {
      for (const event of calendarEvents) {
        expect(overlaps(event, item)).toBe(false);
      }
    }
  });

  it("schedules higher-priority goals before lower-priority goals", () => {
    const plan = generateDailyPlan({
      goals: [
        { title: "Priority 3 task", priority: 3 },
        { title: "Priority 1 task", priority: 1 },
      ],
      preferences: basePreferences,
      calendarEvents: [],
    });

    const goalItems = plan.items.filter((item) => item.type === "goal");
    expect(goalItems.length).toBeGreaterThan(0);
    expect(goalItems[0]?.title).toBe("Priority 1 task");
  });

  it("returns constrained fallback when free time is too limited", () => {
    const calendarEvents: CalendarEvent[] = [
      { id: "m1", startTime: "09:00", endTime: "16:50" },
    ];

    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: basePreferences,
      calendarEvents,
    });

    expect(plan.constrained).toBe(true);
    expect(plan.explanation).toMatch(/constrained/i);
    expect(plan.items.some((item) => item.type === "fallback")).toBe(true);
  });

  it("includes wellbeing action when workout preference is enabled", () => {
    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: {
        ...basePreferences,
        workoutPreference: "light",
      },
      calendarEvents: [],
    });

    expect(plan.items.some((item) => item.type === "wellbeing")).toBe(true);
  });
});
