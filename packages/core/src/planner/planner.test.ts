import { describe, expect, it } from "vitest";
import { generateDailyPlan } from "./planner";

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
    expect(studyIdx).toBeLessThan(goalIdx);
  });
});
