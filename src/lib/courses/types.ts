export type CourseRow = {
  id: string; user_id: string; name: string; code: string | null; color: string | null;
  term: string | null; target_grade: number | null; archived_at: string | null; created_at: string;
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
};
