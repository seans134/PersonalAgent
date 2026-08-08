export type GradeCategory = { id: string; name: string; weight: number };
export type GradedItem = { categoryId: string | null; scoreEarned: number | null; scoreMax: number };
export type CourseGradeCategory = {
  id: string; name: string; weight: number;
  score: number | null; gradedCount: number; itemCount: number;
};
export type CourseGradeWarning = "weights_sum_not_100";
export type CourseGrade = {
  average: number | null;
  gradedWeight: number;
  categories: CourseGradeCategory[];
  warnings: CourseGradeWarning[];
};
