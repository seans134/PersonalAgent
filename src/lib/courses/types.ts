import type { LetterGrade, NeededScore } from "@personal-agent/core";

export type CourseRow = {
  id: string; user_id: string; name: string; code: string | null; color: string | null;
  term: string | null; target_grade: number | null; archived_at: string | null; created_at: string;
  // GPA (packages/core/src/grades/gpa.ts): credits, and the official final letter once the course is done.
  credits: number | null; final_grade_override: LetterGrade | null;
};
export type CourseCategoryRow = {
  id: string; course_id: string; user_id: string; name: string; weight: number; position: number; created_at: string;
};
export type CourseItemRow = {
  id: string; course_id: string; category_id: string | null; user_id: string;
  kind: "assignment" | "quiz" | "exam"; title: string; due_at: string; end_at: string | null;
  location: string | null; score_earned: number | null; score_max: number;
  estimated_effort_hours: number | null; focus_mode: "finish_first" | "continuous" | "deferred"; created_at: string;
};
export type CourseSummaryDTO = {
  id: string; name: string; code: string | null; color: string | null; term: string | null;
  targetGrade: number | null; archivedAt: string | null;
  average: number | null; gradedWeight: number;
  nextItem: { id: string; title: string; kind: CourseItemRow["kind"]; dueAt: string } | null;
  // Soonest ungraded exam due after now.
  nextExam: { id: string; title: string; dueAt: string } | null;
  // Ungraded items due in the next 7 days.
  dueThisWeek: number;
  // Average needed on the remaining work to hit targetGrade.
  needed: NeededScore;
};
