import { describe, expect, it } from "vitest";
import { DEFAULT_EFFORT_HOURS, deriveStudyTasks, effortHoursFor, type StudyItem } from "./study";

const base: Omit<StudyItem, "id" | "focusMode" | "dueLocalDate"> = {
  title: "Essay",
  courseName: "History",
  kind: "assignment",
  scoreEarned: null,
  estimatedEffortHours: 6,
};

describe("deriveStudyTasks", () => {
  it("spreads effort evenly across remaining days", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", focusMode: "continuous", dueLocalDate: "2026-08-10" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 3 days out
    expect(tasks).toHaveLength(1);
    expect(tasks[0].durationMinutes).toBe(120); // 6h*60/3 = 120
    expect(tasks[0].priority).toBe(2); // within 3 days
  });

  it("clamps very large even shares to 120 minutes", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", estimatedEffortHours: 10, focusMode: "continuous", dueLocalDate: "2026-08-08" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 1 day
    expect(tasks[0].durationMinutes).toBe(120);
    expect(tasks[0].priority).toBe(1); // due tomorrow
  });

  it("excludes graded and past-due items", () => {
    const items: StudyItem[] = [
      { ...base, id: "graded", scoreEarned: 90, focusMode: "continuous", dueLocalDate: "2026-08-09" },
      { ...base, id: "past", focusMode: "continuous", dueLocalDate: "2026-08-05" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("sizes items with no effort estimate by their kind default", () => {
    const items: StudyItem[] = [
      { ...base, id: "exam", kind: "exam", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "quiz", kind: "quiz", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "hw", kind: "assignment", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    const byId = new Map(tasks.map((t) => [t.id, t.durationMinutes]));
    expect(byId.get("exam")).toBe(60); // 6h*60/6
    expect(byId.get("quiz")).toBe(20); // 2h*60/6
    expect(byId.get("hw")).toBe(30); // 3h*60/6
  });

  it("uses the student's own estimate over the kind default", () => {
    const items: StudyItem[] = [
      { ...base, id: "exam", kind: "exam", estimatedEffortHours: 12, focusMode: "continuous", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    expect(tasks[0].durationMinutes).toBe(120); // 12h*60/6
  });

  it("still excludes items with an explicit estimate of 0", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", kind: "exam", estimatedEffortHours: 0, focusMode: "continuous", dueLocalDate: "2026-08-09" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("front-loads and prioritizes finish_first ahead of continuous", () => {
    const items: StudyItem[] = [
      { ...base, id: "cont", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    expect(tasks[0].id).toBe("ff");
    expect(tasks[0].priority).toBe(1);
    // ff evenShare = 3*60/6 = 30 -> finish_first max(45, 60)=60
    expect(tasks[0].durationMinutes).toBe(60);
  });

  it("suppresses deferred items while an active finish_first exists", () => {
    const items: StudyItem[] = [
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-12" },
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks.map((t) => t.id)).toEqual(["ff"]);
  });

  it("runs a deferred item as continuous when no finish_first is active", () => {
    const items: StudyItem[] = [
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("def");
  });

  it("respects the horizon", () => {
    const items: StudyItem[] = [
      { ...base, id: "far", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-09-01" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07", 7)).toHaveLength(0);
  });

  it("sorts finish_first items by due date even when passed out of order", () => {
    const items: StudyItem[] = [
      { ...base, id: "ff-later", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-13" },
      { ...base, id: "ff-earlier", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-10" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks[0].id).toBe("ff-earlier");
    expect(tasks[1].id).toBe("ff-later");
  });

  it("sorts same-priority continuous items by due date even when passed out of order", () => {
    const items: StudyItem[] = [
      { ...base, id: "cont-later", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-14" },
      { ...base, id: "cont-earlier", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-12" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks[0].id).toBe("cont-earlier");
    expect(tasks[1].id).toBe("cont-later");
  });
});

describe("effortHoursFor", () => {
  it("defaults by kind when there is no estimate", () => {
    expect(DEFAULT_EFFORT_HOURS).toEqual({ exam: 6, quiz: 2, assignment: 3 });
    expect(effortHoursFor({ kind: "exam", estimatedEffortHours: null })).toBe(6);
    expect(effortHoursFor({ kind: "quiz", estimatedEffortHours: null })).toBe(2);
    expect(effortHoursFor({ kind: "assignment", estimatedEffortHours: null })).toBe(3);
  });

  it("returns a positive own estimate unchanged", () => {
    expect(effortHoursFor({ kind: "exam", estimatedEffortHours: 1.5 })).toBe(1.5);
  });
});
