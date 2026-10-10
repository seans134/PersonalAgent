import {
  computeCourseGrade,
  computeNeededScore,
  type CourseGrade,
  type GradeCategory,
  type GradedItem,
  type NeededScore,
} from "@personal-agent/core";
import type { CourseCategoryRow, CourseItemRow } from "./types";

type CategoryInput = Pick<CourseCategoryRow, "id" | "name" | "weight">;
type ItemInput = Pick<CourseItemRow, "category_id" | "score_earned" | "score_max">;

/** Maps DB rows (numerics may arrive as strings) into the core grade inputs. */
export function gradeInputsFromRows(
  categories: CategoryInput[],
  items: ItemInput[],
): { categories: GradeCategory[]; items: GradedItem[] } {
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight) })),
    items: items.map((item) => ({
      categoryId: item.category_id,
      scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
      scoreMax: Number(item.score_max),
    })),
  };
}

export function courseGradeFromRows(categories: CourseCategoryRow[], items: CourseItemRow[]): CourseGrade {
  const inputs = gradeInputsFromRows(categories, items);
  return computeCourseGrade(inputs.categories, inputs.items);
}

export function courseNeededFromRows(
  categories: CourseCategoryRow[],
  items: CourseItemRow[],
  targetGrade: number | null,
): NeededScore {
  const inputs = gradeInputsFromRows(categories, items);
  return computeNeededScore(inputs.categories, inputs.items, targetGrade === null ? null : Number(targetGrade));
}
