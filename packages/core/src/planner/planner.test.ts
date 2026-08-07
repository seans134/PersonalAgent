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

function gapBetween(first: { endTime: string }, second: { startTime: string }) {
  const [firstHours, firstMinutes] = first.endTime.split(":").map(Number);
  const [secondHours, secondMinutes] = second.startTime.split(":").map(Number);
  return secondHours * 60 + secondMinutes - (firstHours * 60 + firstMinutes);
}

function durationMinutes(item: { startTime: string; endTime: string }) {
  return clockMinutes(item.endTime) - clockMinutes(item.startTime);
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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

  it("places constrained fallbacks in the largest remaining free window", () => {
    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [
        { id: "packed", startTime: "09:00", endTime: "16:50" },
      ],
    });

    const fallback = plan.items.find((item) => item.type === "fallback");

    expect(plan.constrained).toBe(true);
    expect(fallback?.startTime).toBe("16:50");
    expect(fallback?.endTime).toBe("17:00");
  });

  it("does not create fitness blocks from workout preference alone", () => {
    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: {
        ...basePreferences,
        workoutPreference: "light",
      },
      calendarEvents: [],
    });

    expect(plan.items.some((item) => item.type === "fitness")).toBe(false);
  });

  it("does not add automatic focus blocks", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Ship roadmap", priority: 1 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [],
    });

    expect(plan.items.some((item) => item.type === "focus")).toBe(false);
    expect(plan.items.map((item) => item.title)).not.toContain("Focus block");
  });

  it("adds spacing between generated items when the day has room", () => {
    const plan = generateDailyPlan({
      goals: baseGoals,
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [],
    });

    const planned = plan.items.filter((item) => item.type !== "fallback");

    expect(planned.length).toBeGreaterThan(1);
    for (let index = 1; index < planned.length; index += 1) {
      expect(gapBetween(planned[index - 1], planned[index])).toBeGreaterThanOrEqual(15);
    }
  });

  it("prefers a natural buffered start after existing events when possible", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Ship proposal", priority: 1 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [{ id: "class", startTime: "09:00", endTime: "10:00" }],
    });

    expect(plan.items[0]?.startTime).toBe("10:30");
  });

  it("uses short free windows for short tasks instead of wasting larger windows", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Pay tuition bill", priority: 3, taskType: "admin", minimumDailyMinutes: 0 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [
        { id: "busy-1", title: "Busy", startTime: "09:00", endTime: "10:00" },
        { id: "busy-2", title: "Busy", startTime: "10:45", endTime: "12:00" },
        { id: "busy-3", title: "Busy", startTime: "13:00", endTime: "15:00" },
      ],
    });

    const shortGoal = plan.items.find((item) => item.title === "Pay tuition bill");

    expect(clockMinutes(shortGoal!.startTime)).toBeLessThan(clockMinutes("13:00"));
    expect(durationMinutes(shortGoal!)).toBe(25);
  });

  it("uses goal task type and minimum daily minutes for fitness goals", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Get jacked", priority: 1, taskType: "fitness", minimumDailyMinutes: 60 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [],
    });

    const fitnessGoal = plan.items.find((item) => item.title === "Get jacked");

    expect(fitnessGoal?.type).toBe("fitness");
    expect(durationMinutes(fitnessGoal!)).toBe(60);
    expect(fitnessGoal?.reason).toMatch(/minimum 60 minute daily fitness goal/i);
  });

  it("keeps fitness goals as the only strength-training source", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Get jacked", priority: 1, taskType: "fitness", minimumDailyMinutes: 60 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "moderate",
      },
      calendarEvents: [],
    });

    const fitnessItems = plan.items.filter((item) => item.type === "fitness");

    expect(fitnessItems).toHaveLength(1);
    expect(fitnessItems[0]?.title).toBe("Get jacked");
  });

  it("avoids placing movement between nearby academic blocks", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Strength training", priority: 1, taskType: "fitness", minimumDailyMinutes: 30 }],
      preferences: {
        ...basePreferences,
        focusBlockMinutes: 45,
        workoutPreference: "none",
      },
      calendarEvents: [
        { id: "review", title: "Exam review", category: "school", startTime: "09:00", endTime: "10:00" },
        { id: "lecture", title: "Math lecture", category: "school", startTime: "12:00", endTime: "13:00" },
      ],
    });

    const movement = plan.items.find((item) => item.type === "fitness");

    expect(clockMinutes(movement!.startTime)).toBeGreaterThanOrEqual(clockMinutes("13:00"));
  });

  it("infers movement goals from text and avoids academic sandwiches", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Get jacked", priority: 1, minimumDailyMinutes: 60 }],
      preferences: {
        workStartTime: "08:00",
        workEndTime: "23:00",
        noMeetingStartTime: null,
        noMeetingEndTime: null,
        focusBlockMinutes: 60,
        workoutPreference: "none",
      },
      calendarEvents: [
        { id: "review", title: "Exam review", category: "school", startTime: "08:00", endTime: "09:00" },
        { id: "lecture", title: "Math lecture", category: "school", startTime: "10:00", endTime: "13:00" },
        { id: "class", title: "Math class", category: "school", startTime: "14:00", endTime: "15:00" },
        { id: "friends", title: "Hangout with friends", category: "personal", startTime: "17:00", endTime: "20:00" },
      ],
    });

    const movementGoal = plan.items.find((item) => item.title === "Get jacked");

    expect(movementGoal?.type).toBe("fitness");
    expect(movementGoal?.startTime).not.toBe("09:00");
    expect(clockMinutes(movementGoal!.startTime)).toBeGreaterThanOrEqual(clockMinutes("20:00"));
  });

  it("keeps zero minute goal minimums on the default priority duration", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Keep desk clean", priority: 3, taskType: "admin", minimumDailyMinutes: 0 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [],
    });

    const adminGoal = plan.items.find((item) => item.title === "Keep desk clean");

    expect(adminGoal?.type).toBe("goal");
    expect(durationMinutes(adminGoal!)).toBe(25);
  });

  it("caps ridiculous goal minimums to a schedulable block size", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Practice forever", priority: 1, taskType: "focus", minimumDailyMinutes: 9999 }],
      preferences: {
        ...basePreferences,
        workoutPreference: "none",
      },
      calendarEvents: [],
    });

    const cappedGoal = plan.items.find((item) => item.title === "Practice forever");

    expect(cappedGoal?.type).toBe("focus");
    expect(durationMinutes(cappedGoal!)).toBe(180);
    expect(cappedGoal?.reason).toMatch(/minimum 180 minute daily focus goal/i);
  });
});

describe("generateDailyPlan study tasks", () => {
  const preferences = {
    workStartTime: "09:00",
    workEndTime: "17:00",
    noMeetingStartTime: null,
    noMeetingEndTime: null,
    focusBlockMinutes: 60,
    workoutPreference: "none" as const,
  };

  it("places a study task into free time without overlapping an exam block", () => {
    const plan = generateDailyPlan({
      goals: [],
      preferences,
      calendarEvents: [{ id: "exam", title: "Midterm", category: "school", startTime: "10:00", endTime: "12:00" }],
      studyTasks: [
        { id: "s1", title: "Study: Midterm", reason: "Exam tomorrow", durationMinutes: 60, priority: 1, focusMode: "finish_first" },
      ],
    });
    const study = plan.items.find((i) => i.type === "study");
    expect(study).toBeDefined();
    // must not overlap 10:00-12:00
    const start = Number(study!.startTime.slice(0, 2)) * 60 + Number(study!.startTime.slice(3));
    const end = Number(study!.endTime.slice(0, 2)) * 60 + Number(study!.endTime.slice(3));
    expect(end <= 600 || start >= 720).toBe(true);
    expect(plan.constrained).toBe(false);
  });

  it("schedules finish-first study before a goal", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Read book", priority: 2 }],
      preferences,
      calendarEvents: [],
      studyTasks: [
        { id: "s1", title: "Study: Final", reason: "soon", durationMinutes: 60, priority: 1, focusMode: "finish_first" },
      ],
    });
    const studyIdx = plan.items.findIndex((i) => i.type === "study");
    const goalIdx = plan.items.findIndex((i) => i.type === "goal");
    expect(studyIdx).toBeGreaterThanOrEqual(0);
    expect(goalIdx).toBeGreaterThanOrEqual(0);
  });
});
