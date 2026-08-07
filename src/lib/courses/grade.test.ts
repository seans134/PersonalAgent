import { describe, expect, it } from "vitest";
import { courseGradeFromRows } from "./grade";
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
