import type { createClient } from "@/lib/supabase/server";
import { courseGradeFromRows } from "./grade";
import type { CourseCategoryRow, CourseItemRow, CourseRow, CourseSummaryDTO } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const COURSE_COLUMNS = "id, user_id, name, code, color, term, target_grade, archived_at, created_at";
const CATEGORY_COLUMNS = "id, course_id, user_id, name, weight, position, created_at";
const ITEM_COLUMNS =
  "id, course_id, category_id, user_id, kind, title, due_at, end_at, location, score_earned, score_max, estimated_effort_hours, focus_mode, created_at";

export async function listCourseSummaries(
  supabase: SupabaseClient,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<CourseSummaryDTO[]> {
  let coursesQuery = supabase.from("courses").select(COURSE_COLUMNS).eq("user_id", userId);
  if (!opts.includeArchived) coursesQuery = coursesQuery.is("archived_at", null);
  const { data: courses, error: coursesError } = await coursesQuery.order("created_at", { ascending: true });
  if (coursesError) throw new Error(`Unable to load courses: ${coursesError.message}`);

  const { data: categories, error: categoriesError } = await supabase
    .from("course_categories").select(CATEGORY_COLUMNS).eq("user_id", userId);
  if (categoriesError) throw new Error(`Unable to load categories: ${categoriesError.message}`);

  const { data: items, error: itemsError } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).order("due_at", { ascending: true });
  if (itemsError) throw new Error(`Unable to load course items: ${itemsError.message}`);

  const categoriesByCourse = groupBy((categories ?? []) as CourseCategoryRow[], (c) => c.course_id);
  const itemsByCourse = groupBy((items ?? []) as CourseItemRow[], (i) => i.course_id);
  const nowIso = new Date().toISOString();

  return ((courses ?? []) as CourseRow[]).map((course) => {
    const courseCategories = categoriesByCourse.get(course.id) ?? [];
    const courseItems = itemsByCourse.get(course.id) ?? [];
    const grade = courseGradeFromRows(courseCategories, courseItems);
    const upcoming = courseItems.filter((i) => i.score_earned === null && i.due_at >= nowIso);
    const nextItem = upcoming[0]
      ? { id: upcoming[0].id, title: upcoming[0].title, kind: upcoming[0].kind, dueAt: upcoming[0].due_at }
      : null;
    return {
      id: course.id, name: course.name, code: course.code, color: course.color, term: course.term,
      targetGrade: course.target_grade === null ? null : Number(course.target_grade),
      archivedAt: course.archived_at, average: grade.average, gradedWeight: grade.gradedWeight, nextItem,
    };
  });
}

export async function getCourseDetail(supabase: SupabaseClient, userId: string, courseId: string) {
  const { data: course, error } = await supabase
    .from("courses").select(COURSE_COLUMNS).eq("user_id", userId).eq("id", courseId).maybeSingle();
  if (error) throw new Error(`Unable to load course: ${error.message}`);
  if (!course) return null;

  const { data: categories } = await supabase
    .from("course_categories").select(CATEGORY_COLUMNS).eq("user_id", userId).eq("course_id", courseId)
    .order("position", { ascending: true });
  const { data: items } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).eq("course_id", courseId)
    .order("due_at", { ascending: true });

  return {
    course: course as CourseRow,
    categories: (categories ?? []) as CourseCategoryRow[],
    items: (items ?? []) as CourseItemRow[],
  };
}

export async function fetchAllCourseItems(supabase: SupabaseClient, userId: string): Promise<CourseItemRow[]> {
  const { data, error } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).order("due_at", { ascending: true });
  if (error) throw new Error(`Unable to load course items: ${error.message}`);
  return (data ?? []) as CourseItemRow[];
}

export async function fetchCoursesById(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("courses").select("id, name").eq("user_id", userId);
  if (error) throw new Error(`Unable to load courses: ${error.message}`);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
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
