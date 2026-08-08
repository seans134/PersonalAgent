"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const KINDS = new Set(["assignment", "quiz", "exam"]);
const MODES = new Set(["finish_first", "continuous", "deferred"]);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return { supabase, user };
}

async function courseIsOwnedByUser(supabase: SupabaseServerClient, userId: string, courseId: string) {
  const { data } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

async function categoryBelongsToCourse(
  supabase: SupabaseServerClient,
  userId: string,
  courseId: string,
  categoryId: string | null,
) {
  if (!categoryId) {
    return true;
  }

  const { data } = await supabase
    .from("course_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

function parseWeight(formData: FormData) {
  const raw = Number(formData.get("weight") ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
}

function parsePosition(formData: FormData) {
  const raw = Number(formData.get("position") ?? 0);
  return Number.isFinite(raw) ? Math.round(raw) : 0;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function createCourse(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/courses?error=Course%20name%20is%20required");
  }

  const targetRaw = String(formData.get("target_grade") ?? "").trim();
  const target = targetRaw ? Number(targetRaw) : null;
  if (target !== null && (!Number.isFinite(target) || target < 0 || target > 100)) {
    redirect("/courses?error=Target%20grade%20must%20be%200-100");
  }

  const { error } = await supabase.from("courses").insert({
    user_id: user.id,
    name,
    code: String(formData.get("code") ?? "").trim() || null,
    term: String(formData.get("term") ?? "").trim() || null,
    color: String(formData.get("color") ?? "").trim() || null,
    target_grade: target,
  });

  if (error) {
    redirect(`/courses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/courses");
  redirect("/courses");
}

export async function updateCourse(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/courses?error=Course%20name%20is%20required");
  }

  const targetRaw = String(formData.get("target_grade") ?? "").trim();
  const target = targetRaw ? Number(targetRaw) : null;
  if (target !== null && (!Number.isFinite(target) || target < 0 || target > 100)) {
    redirect("/courses?error=Target%20grade%20must%20be%200-100");
  }

  const { error } = await supabase
    .from("courses")
    .update({
      name,
      code: String(formData.get("code") ?? "").trim() || null,
      term: String(formData.get("term") ?? "").trim() || null,
      color: String(formData.get("color") ?? "").trim() || null,
      target_grade: target,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath(`/courses/${id}`);
  redirect("/courses");
}

export async function archiveCourse(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const archived = String(formData.get("archived") ?? "true").trim().toLowerCase() !== "false";

  const { error } = await supabase
    .from("courses")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/courses");
  revalidatePath(`/courses/${id}`);
  redirect("/courses");
}

export async function deleteCourse(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const { error } = await supabase.from("courses").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`/courses?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/courses");
  redirect("/courses");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategory(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/courses/${courseId}?error=Category%20name%20is%20required`);
  }

  const owned = await courseIsOwnedByUser(supabase, user.id, courseId);
  if (!owned) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent("Course not found")}`);
  }

  const { error } = await supabase.from("course_categories").insert({
    user_id: user.id,
    course_id: courseId,
    name,
    weight: parseWeight(formData),
    position: parsePosition(formData),
  });

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  redirect(`/courses/${courseId}`);
}

export async function updateCategory(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const categoryId = String(formData.get("category_id") ?? "").trim();
  if (!categoryId) {
    redirect(`/courses/${courseId}?error=Category%20id%20is%20required`);
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/courses/${courseId}?error=Category%20name%20is%20required`);
  }

  const { error } = await supabase
    .from("course_categories")
    .update({
      name,
      weight: parseWeight(formData),
      position: parsePosition(formData),
    })
    .eq("id", categoryId)
    .eq("course_id", courseId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  redirect(`/courses/${courseId}`);
}

export async function deleteCategory(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const categoryId = String(formData.get("category_id") ?? "").trim();
  if (!categoryId) {
    redirect(`/courses/${courseId}?error=Category%20id%20is%20required`);
  }

  const { error } = await supabase
    .from("course_categories")
    .delete()
    .eq("id", categoryId)
    .eq("course_id", courseId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  redirect(`/courses/${courseId}`);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function parseDueAt(courseId: string, formData: FormData) {
  const raw = String(formData.get("due_at") ?? "").trim();
  if (!raw) {
    redirect(`/courses/${courseId}?error=Due%20date%20is%20required`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    redirect(`/courses/${courseId}?error=Due%20date%20is%20invalid`);
  }

  return parsed.toISOString();
}

function parseEndAt(courseId: string, formData: FormData) {
  const raw = String(formData.get("end_at") ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    redirect(`/courses/${courseId}?error=End%20date%20is%20invalid`);
  }

  return parsed.toISOString();
}

function parseScoreMax(courseId: string, formData: FormData) {
  const raw = String(formData.get("score_max") ?? "").trim();
  const value = raw ? Number(raw) : 100;
  if (!Number.isFinite(value) || value <= 0) {
    redirect(`/courses/${courseId}?error=Max%20score%20must%20be%20greater%20than%20zero`);
  }

  return value;
}

function parseEstimatedEffortHours(courseId: string, formData: FormData) {
  const raw = String(formData.get("estimated_effort_hours") ?? "").trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    redirect(`/courses/${courseId}?error=Estimated%20effort%20must%20be%20zero%20or%20greater`);
  }

  return value;
}

function parseFocusMode(formData: FormData) {
  const raw = String(formData.get("focus_mode") ?? "continuous").trim();
  return MODES.has(raw) ? raw : "continuous";
}

export async function createItem(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const owned = await courseIsOwnedByUser(supabase, user.id, courseId);
  if (!owned) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent("Course not found")}`);
  }

  const kind = String(formData.get("kind") ?? "").trim();
  if (!KINDS.has(kind)) {
    redirect(`/courses/${courseId}?error=Invalid%20item%20kind`);
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    redirect(`/courses/${courseId}?error=Item%20title%20is%20required`);
  }

  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const categoryOwned = await categoryBelongsToCourse(supabase, user.id, courseId, categoryId);
  if (!categoryOwned) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent("Category not found for this course")}`);
  }

  const dueAt = parseDueAt(courseId, formData);
  const endAt = parseEndAt(courseId, formData);
  const scoreMax = parseScoreMax(courseId, formData);
  const estimatedEffortHours = parseEstimatedEffortHours(courseId, formData);
  const focusMode = parseFocusMode(formData);
  const location = String(formData.get("location") ?? "").trim() || null;

  const { error } = await supabase.from("course_items").insert({
    user_id: user.id,
    course_id: courseId,
    category_id: categoryId,
    kind,
    title,
    due_at: dueAt,
    end_at: endAt,
    location,
    score_max: scoreMax,
    estimated_effort_hours: estimatedEffortHours,
    focus_mode: focusMode,
  });

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect(`/courses/${courseId}`);
}

export async function updateItem(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const itemId = String(formData.get("item_id") ?? "").trim();
  if (!itemId) {
    redirect(`/courses/${courseId}?error=Item%20id%20is%20required`);
  }

  const kind = String(formData.get("kind") ?? "").trim();
  if (!KINDS.has(kind)) {
    redirect(`/courses/${courseId}?error=Invalid%20item%20kind`);
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    redirect(`/courses/${courseId}?error=Item%20title%20is%20required`);
  }

  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const categoryOwned = await categoryBelongsToCourse(supabase, user.id, courseId, categoryId);
  if (!categoryOwned) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent("Category not found for this course")}`);
  }

  const dueAt = parseDueAt(courseId, formData);
  const endAt = parseEndAt(courseId, formData);
  const scoreMax = parseScoreMax(courseId, formData);
  const estimatedEffortHours = parseEstimatedEffortHours(courseId, formData);
  const focusMode = parseFocusMode(formData);
  const location = String(formData.get("location") ?? "").trim() || null;

  const { error } = await supabase
    .from("course_items")
    .update({
      kind,
      title,
      category_id: categoryId,
      due_at: dueAt,
      end_at: endAt,
      location,
      score_max: scoreMax,
      estimated_effort_hours: estimatedEffortHours,
      focus_mode: focusMode,
    })
    .eq("id", itemId)
    .eq("course_id", courseId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect(`/courses/${courseId}`);
}

export async function setItemGrade(formData: FormData) {
  const { supabase, user } = await requireUser();

  const itemId = String(formData.get("item_id") ?? "").trim();
  const courseId = String(formData.get("course_id") ?? "").trim();

  const raw = String(formData.get("score_earned") ?? "").trim();
  const score = raw === "" ? null : Number(raw);
  if (score !== null && (!Number.isFinite(score) || score < 0)) {
    redirect(`/courses/${courseId}?error=Grade%20must%20be%20zero%20or%20greater`);
  }

  const { error } = await supabase
    .from("course_items")
    .update({ score_earned: score })
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect(`/courses/${courseId}`);
}

export async function deleteItem(formData: FormData) {
  const { supabase, user } = await requireUser();

  const courseId = String(formData.get("course_id") ?? "").trim();
  if (!courseId) {
    redirect("/courses?error=Course%20id%20is%20required");
  }

  const itemId = String(formData.get("item_id") ?? "").trim();
  if (!itemId) {
    redirect(`/courses/${courseId}?error=Item%20id%20is%20required`);
  }

  const { error } = await supabase
    .from("course_items")
    .delete()
    .eq("id", itemId)
    .eq("course_id", courseId)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect(`/courses/${courseId}`);
}
