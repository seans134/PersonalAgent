import type { CourseGrade, CourseGradeCategory, CourseGradeWarning, GradeCategory, GradedItem } from "./types";

export function computeCourseGrade(categories: GradeCategory[], items: GradedItem[]): CourseGrade {
  const gradedByCategory = new Map<string, { earned: number; max: number; graded: number; total: number }>();

  for (const category of categories) {
    gradedByCategory.set(category.id, { earned: 0, max: 0, graded: 0, total: 0 });
  }

  for (const item of items) {
    if (item.categoryId === null) continue;
    const bucket = gradedByCategory.get(item.categoryId);
    if (!bucket) continue;
    bucket.total += 1;
    if (item.scoreEarned !== null && Number.isFinite(item.scoreEarned) && item.scoreMax > 0) {
      bucket.earned += item.scoreEarned;
      bucket.max += item.scoreMax;
      bucket.graded += 1;
    }
  }

  const categoryResults: CourseGradeCategory[] = categories.map((category) => {
    const bucket = gradedByCategory.get(category.id)!;
    const score = bucket.graded > 0 && bucket.max > 0 ? (bucket.earned / bucket.max) * 100 : null;
    return {
      id: category.id,
      name: category.name,
      weight: category.weight,
      score,
      gradedCount: bucket.graded,
      itemCount: bucket.total,
    };
  });

  const graded = categoryResults.filter((c) => c.score !== null);
  const gradedWeight = graded.reduce((sum, c) => sum + c.weight, 0);
  const average =
    graded.length > 0 && gradedWeight > 0
      ? graded.reduce((sum, c) => sum + (c.score as number) * c.weight, 0) / gradedWeight
      : null;

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const warnings: CourseGradeWarning[] = [];
  if (categories.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
    warnings.push("weights_sum_not_100");
  }

  return { average, gradedWeight, categories: categoryResults, warnings };
}
