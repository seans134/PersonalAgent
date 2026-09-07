import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { validateSyllabusDraft } from "@/lib/courses/syllabus-parse";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown };

  try {
    const draft = validateSyllabusDraft(payload.draft);

    // 1) Course
    const { data: course, error: courseError } = await auth.supabase
      .from("courses")
      .insert({
        user_id: auth.user.id,
        name: draft.course.name,
        code: draft.course.code,
        term: draft.course.term,
        target_grade: draft.course.target_grade,
      })
      .select("id")
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: courseError?.message ?? "Unable to create course." }, { status: 500 });
    }

    const courseId = course.id as string;

    // 2) Categories — insert in order and map name -> id for the items below.
    const categoryIdByName = new Map<string, string>();
    if (draft.categories.length > 0) {
      const { data: categories, error: categoryError } = await auth.supabase
        .from("course_categories")
        .insert(
          draft.categories.map((category) => ({
            user_id: auth.user.id,
            course_id: courseId,
            name: category.name,
            weight: category.weight,
            position: category.position,
          })),
        )
        .select("id, name");

      if (categoryError) {
        return NextResponse.json({ error: categoryError.message }, { status: 500 });
      }

      for (const category of categories ?? []) {
        categoryIdByName.set(String(category.name).toLowerCase(), category.id as string);
      }
    }

    // 3) Items — only those with a valid due date and marked for inclusion.
    const insertableItems = draft.items.filter((item) => item.include && item.due_at);
    let itemsInserted = 0;
    if (insertableItems.length > 0) {
      const { error: itemError } = await auth.supabase.from("course_items").insert(
        insertableItems.map((item) => ({
          user_id: auth.user.id,
          course_id: courseId,
          category_id: item.categoryName ? categoryIdByName.get(item.categoryName.toLowerCase()) ?? null : null,
          kind: item.kind,
          title: item.title,
          due_at: item.due_at,
          score_max: item.score_max,
        })),
      );

      if (itemError) {
        return NextResponse.json({ error: itemError.message }, { status: 500 });
      }

      itemsInserted = insertableItems.length;
    }

    revalidatePath("/courses");
    revalidatePath("/");

    return NextResponse.json(
      { courseId, applied: { categories: draft.categories.length, items: itemsInserted } },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid syllabus draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
