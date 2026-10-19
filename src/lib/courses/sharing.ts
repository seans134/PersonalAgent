import { randomBytes } from "node:crypto";
import {
  buildJoinUrl,
  courseTemplateFromSnapshot,
  isShareToken,
  shareTokenFromBytes,
  type CourseTemplate,
} from "@personal-agent/core";
import { siteUrl } from "@/lib/site-url";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// 24 random bytes = 192 bits, comfortably over the 128-bit floor.
const SHARE_TOKEN_BYTES = 24;
const UNIQUE_VIOLATION = "23505";

export type CourseShareDTO = {
  url: string;
  createdAt: string;
  /** Classmates who added the course from any of its links, current or stopped. */
  joinedCount: number;
};

export type ResolvedShare = {
  shareId: string;
  /** Set only when the caller owns the shared course. */
  ownCourseId: string | null;
  template: CourseTemplate;
};

export type JoinShareResult =
  | { status: "not_found" }
  | { status: "joined"; courseId: string; created: boolean; itemCount: number };

export class CourseShareError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function joinedCount(supabase: SupabaseClient, courseId: string): Promise<number> {
  const { data, error } = await supabase.rpc("course_share_join_count", { target_course_id: courseId });
  if (error) throw new Error(`Unable to load share: ${error.message}`);
  return typeof data === "number" ? data : Number(data ?? 0) || 0;
}

async function toDTO(supabase: SupabaseClient, courseId: string, row: { token: string; created_at: string }) {
  return {
    url: buildJoinUrl(siteUrl(), row.token),
    createdAt: row.created_at,
    joinedCount: await joinedCount(supabase, courseId),
  } satisfies CourseShareDTO;
}

async function activeShareRow(supabase: SupabaseClient, userId: string, courseId: string) {
  const { data, error } = await supabase
    .from("course_shares").select("id, token, created_at")
    .eq("course_id", courseId).eq("user_id", userId).is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to load share: ${error.message}`);
  return data as { id: string; token: string; created_at: string } | null;
}

async function ownedCourse(supabase: SupabaseClient, userId: string, courseId: string) {
  const { data, error } = await supabase
    .from("courses").select("id, archived_at").eq("id", courseId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Unable to load course: ${error.message}`);
  return data as { id: string; archived_at: string | null } | null;
}

/** The course's active share link, or null when it isn't shared. */
export async function getCourseShare(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<CourseShareDTO | null> {
  const row = await activeShareRow(supabase, userId, courseId);
  return row ? toDTO(supabase, courseId, row) : null;
}

/** Returns the course's active share, creating one (with a fresh random token) if needed. */
export async function createCourseShare(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<{ share: CourseShareDTO; created: boolean }> {
  const course = await ownedCourse(supabase, userId, courseId);
  if (!course) throw new CourseShareError("Course not found.", 404);
  if (course.archived_at) throw new CourseShareError("Restore this course before sharing it.", 400);

  const existing = await activeShareRow(supabase, userId, courseId);
  if (existing) return { share: await toDTO(supabase, courseId, existing), created: false };

  const { data, error } = await supabase
    .from("course_shares")
    .insert({ course_id: courseId, user_id: userId, token: shareTokenFromBytes(randomBytes(SHARE_TOKEN_BYTES)) })
    .select("id, token, created_at")
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    // A second tap raced this one; the unique active-share index kept one link.
    const raced = await activeShareRow(supabase, userId, courseId);
    if (raced) return { share: await toDTO(supabase, courseId, raced), created: false };
  }
  if (error || !data) throw new Error(`Unable to share course: ${error?.message ?? "no row returned"}`);
  return { share: await toDTO(supabase, courseId, data as { token: string; created_at: string }), created: true };
}

/** Stops sharing: the current link stops working. Courses classmates already added are kept. */
export async function revokeCourseShare(supabase: SupabaseClient, userId: string, courseId: string): Promise<void> {
  const { error } = await supabase
    .from("course_shares").update({ revoked_at: new Date().toISOString() })
    .eq("course_id", courseId).eq("user_id", userId).is("revoked_at", null);
  if (error) throw new Error(`Unable to stop sharing: ${error.message}`);
}

/**
 * Resolves a token through the course_share_template SECURITY DEFINER function (see the
 * course_shares migration), which returns only template columns for active shares. Unknown,
 * malformed, revoked and archived shares all come back as null so callers answer one generic 404.
 */
export async function resolveCourseShare(supabase: SupabaseClient, token: unknown): Promise<ResolvedShare | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await supabase.rpc("course_share_template", { share_token: token });
  if (error) throw new Error(`Unable to load shared course: ${error.message}`);
  const snapshot = data as { shareId?: unknown; ownCourseId?: unknown } | null;
  if (!snapshot || typeof snapshot.shareId !== "string") return null;
  const template = courseTemplateFromSnapshot(snapshot);
  if (!template) return null;
  return {
    shareId: snapshot.shareId,
    ownCourseId: typeof snapshot.ownCourseId === "string" ? snapshot.ownCourseId : null,
    template,
  };
}

async function existingJoinedCourse(supabase: SupabaseClient, userId: string, shareId: string) {
  const { data, error } = await supabase
    .from("courses").select("id").eq("user_id", userId).eq("joined_from_share_id", shareId).maybeSingle();
  if (error) throw new Error(`Unable to load courses: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Copies a shared course template into the student's account as a new course they own.
 * Joining the same share again returns the course from the first join; the owner gets their own course.
 */
export async function joinCourseShare(supabase: SupabaseClient, userId: string, token: unknown): Promise<JoinShareResult> {
  const share = await resolveCourseShare(supabase, token);
  if (!share) return { status: "not_found" };
  const { template } = share;
  const itemCount = template.items.length;

  if (share.ownCourseId) return { status: "joined", courseId: share.ownCourseId, created: false, itemCount };
  const existingId = await existingJoinedCourse(supabase, userId, share.shareId);
  if (existingId) return { status: "joined", courseId: existingId, created: false, itemCount };

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .insert({
      user_id: userId,
      name: template.course.name,
      code: template.course.code,
      term: template.course.term,
      joined_from_share_id: share.shareId,
    })
    .select("id")
    .single();
  if (courseError?.code === UNIQUE_VIOLATION) {
    // A double tap: the (user_id, joined_from_share_id) index let the first insert win.
    const racedId = await existingJoinedCourse(supabase, userId, share.shareId);
    if (racedId) return { status: "joined", courseId: racedId, created: false, itemCount };
  }
  if (courseError || !course) throw new Error(`Unable to add course: ${courseError?.message ?? "no row returned"}`);
  const courseId = (course as { id: string }).id;

  try {
    const categoryIds: string[] = [];
    if (template.categories.length > 0) {
      const { data: categories, error } = await supabase
        .from("course_categories")
        .insert(template.categories.map((category, position) => ({
          user_id: userId, course_id: courseId, name: category.name, weight: category.weight, position,
        })))
        .select("id, position");
      if (error) throw new Error(error.message);
      for (const row of (categories ?? []) as Array<{ id: string; position: number }>) categoryIds[row.position] = row.id;
    }

    if (itemCount > 0) {
      const { error } = await supabase.from("course_items").insert(template.items.map((item) => ({
        user_id: userId,
        course_id: courseId,
        category_id: item.categoryIndex === null ? null : categoryIds[item.categoryIndex] ?? null,
        kind: item.kind,
        title: item.title,
        due_at: item.dueAt,
        end_at: item.endAt,
        score_max: item.scoreMax,
        estimated_effort_hours: item.estimatedEffortHours,
      })));
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    // Don't leave a half-copied course behind; a retry starts clean.
    await supabase.from("courses").delete().eq("id", courseId).eq("user_id", userId);
    throw new Error(`Unable to add course: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return { status: "joined", courseId, created: true, itemCount };
}
