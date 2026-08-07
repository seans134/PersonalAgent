import { computeCourseGrade, type CourseGrade, type GradeCategory, type GradedItem } from "@personal-agent/core";
import type { CourseCategoryRow, CourseItemRow } from "./types";

export function courseGradeFromRows(categories: CourseCategoryRow[], items: CourseItemRow[]): CourseGrade {
  const gradeCategories: GradeCategory[] = categories.map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight) }));
  const gradedItems: GradedItem[] = items.map((item) => ({
    categoryId: item.category_id,
    scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
    scoreMax: Number(item.score_max),
  }));
  return computeCourseGrade(gradeCategories, gradedItems);
}
