import { dateInTimezone } from "@personal-agent/core/calendar";
import { buildSemesterTimeline, type SemesterTimeline } from "@personal-agent/core";
import type { createClient } from "@/lib/supabase/server";
import { profileTimezoneForUser } from "@/lib/planner/checkoff-store";
import { localDateOnly } from "./local-time";
import type { CourseCategoryRow, CourseItemRow, CourseRow } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The semester timeline (packages/core/src/grades/semester.ts) for the student's active courses,
 * in their profile timezone. Shared by the web Semester page and GET /api/mobile/semester.
 */
export async function loadSemesterTimeline(
  supabase: SupabaseClient,
  userId: string,
  requestedTerm: string | null,
  now: Date = new Date(),
): Promise<SemesterTimeline> {
  const timezone = await profileTimezoneForUser(supabase, userId);

  const { data: courses, error: coursesError } = await supabase
    .from("courses").select("id, name, code, term").eq("user_id", userId).is("archived_at", null);
  if (coursesError) throw new Error(`Unable to load courses: ${coursesError.message}`);

  const { data: categories, error: categoriesError } = await supabase
    .from("course_categories").select("id, course_id, weight").eq("user_id", userId);
  if (categoriesError) throw new Error(`Unable to load categories: ${categoriesError.message}`);

  const { data: items, error: itemsError } = await supabase
    .from("course_items")
    .select("id, course_id, category_id, kind, title, due_at, score_earned, score_max, estimated_effort_hours")
    .eq("user_id", userId)
    .order("due_at", { ascending: true });
  if (itemsError) throw new Error(`Unable to load course items: ${itemsError.message}`);

  type CourseCols = Pick<CourseRow, "id" | "name" | "code" | "term">;
  type CategoryCols = Pick<CourseCategoryRow, "id" | "course_id" | "weight">;
  type ItemCols = Pick<
    CourseItemRow,
    | "id" | "course_id" | "category_id" | "kind" | "title" | "due_at" | "score_earned" | "score_max"
    | "estimated_effort_hours"
  >;

  return buildSemesterTimeline({
    courses: ((courses ?? []) as CourseCols[]).map((c) => ({ id: c.id, name: c.name, code: c.code, term: c.term })),
    categories: ((categories ?? []) as CategoryCols[]).map((c) => ({
      id: c.id, courseId: c.course_id, weight: Number(c.weight),
    })),
    items: ((items ?? []) as ItemCols[]).map((item) => ({
      id: item.id,
      courseId: item.course_id,
      categoryId: item.category_id,
      kind: item.kind,
      title: item.title,
      dueAt: item.due_at,
      dueLocalDate: localDateOnly(item.due_at, timezone),
      scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
      scoreMax: Number(item.score_max),
      estimatedEffortHours: item.estimated_effort_hours === null ? null : Number(item.estimated_effort_hours),
    })),
    todayLocalDate: dateInTimezone(now, timezone),
    requestedTerm,
  });
}
