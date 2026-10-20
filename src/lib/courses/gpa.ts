import { buildGpaSummary, computeCourseGrade, isLetterGrade, type GpaSummary } from "@personal-agent/core";
import type { createClient } from "@/lib/supabase/server";
import { gradeInputsFromRows } from "./grade";
import type { CourseCategoryRow, CourseItemRow, CourseRow } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * GPA summary (packages/core/src/grades/gpa.ts) over every course, archived ones included since
 * past terms are usually archived, on the student's Profile GPA scale. Shared by the web GPA page
 * and GET /api/mobile/gpa.
 */
export async function loadGpaSummary(
  supabase: SupabaseClient,
  userId: string,
  options: { targetGpa?: number | null; term?: string | null } = {},
): Promise<GpaSummary> {
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles").select("gpa_scale").eq("user_id", userId).maybeSingle();
  if (profileError) throw new Error(`Unable to load profile: ${profileError.message}`);

  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, name, code, term, target_grade, credits, final_grade_override")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (coursesError) throw new Error(`Unable to load courses: ${coursesError.message}`);

  const { data: categories, error: categoriesError } = await supabase
    .from("course_categories").select("id, course_id, name, weight").eq("user_id", userId);
  if (categoriesError) throw new Error(`Unable to load categories: ${categoriesError.message}`);

  const { data: items, error: itemsError } = await supabase
    .from("course_items").select("course_id, category_id, score_earned, score_max").eq("user_id", userId);
  if (itemsError) throw new Error(`Unable to load course items: ${itemsError.message}`);

  type CourseCols = Pick<CourseRow, "id" | "name" | "code" | "term" | "target_grade" | "credits" | "final_grade_override">;
  type CategoryCols = Pick<CourseCategoryRow, "id" | "course_id" | "name" | "weight">;
  type ItemCols = Pick<CourseItemRow, "course_id" | "category_id" | "score_earned" | "score_max">;

  const categoriesByCourse = groupBy((categories ?? []) as CategoryCols[], (c) => c.course_id);
  const itemsByCourse = groupBy((items ?? []) as ItemCols[], (i) => i.course_id);
  const scale = (profile as { gpa_scale?: unknown } | null)?.gpa_scale;

  return buildGpaSummary({
    scaleId: scale,
    targetGpa: options.targetGpa ?? null,
    requestedTerm: options.term ?? null,
    courses: ((courses ?? []) as CourseCols[]).map((course) => {
      const inputs = gradeInputsFromRows(categoriesByCourse.get(course.id) ?? [], itemsByCourse.get(course.id) ?? []);
      return {
        id: course.id,
        name: course.name,
        code: course.code,
        term: course.term,
        // numerics may arrive as strings.
        credits: course.credits === null ? null : Number(course.credits),
        finalGrade: isLetterGrade(course.final_grade_override) ? course.final_grade_override : null,
        currentPercent: computeCourseGrade(inputs.categories, inputs.items).average,
        targetPercent: course.target_grade === null ? null : Number(course.target_grade),
      };
    }),
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}
