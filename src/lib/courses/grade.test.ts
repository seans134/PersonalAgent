import { expect, it } from "vitest";
import { courseGradeFromRows, courseNeededFromRows } from "./grade";
import type { CourseCategoryRow, CourseItemRow } from "./types";

const cat = (id: string, weight: number): CourseCategoryRow => ({
  id, course_id: "c", user_id: "u", name: id, weight, position: 0, created_at: "",
});
const item = (categoryId: string, earned: number | null): CourseItemRow => ({
  id: Math.random().toString(), course_id: "c", category_id: categoryId, user_id: "u",
  kind: "assignment", title: "x", due_at: "2026-08-10T00:00:00Z", end_at: null, location: null,
  score_earned: earned, score_max: 100, estimated_effort_hours: null, focus_mode: "continuous", created_at: "",
});

it("maps rows into a course grade", () => {
  const result = courseGradeFromRows([cat("hw", 100)], [item("hw", 80)]);
  expect(result.average).toBeCloseTo(80, 5);
});

it("computes the needed score from rows with the course target", () => {
  const result = courseNeededFromRows([cat("hw", 50), cat("exam", 50)], [item("hw", 80), item("exam", null)], 85);
  expect(result.status).toBe("needed");
  if (result.status !== "needed") return;
  expect(result.neededPercent).toBeCloseTo(90, 9);
  expect(result.remainingWeight).toBeCloseTo(50, 9);
});

it("reports no_target when the course has no target grade", () => {
  expect(courseNeededFromRows([cat("hw", 100)], [item("hw", 80)], null)).toEqual({ status: "no_target" });
});
