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
  /** Set only when the caller owns the shared course. */
  ownCourseId: string | null;
  template: CourseTemplate;
};

export type JoinShareResult =
  | { status: "not_found" }
  | { status: "joined"; courseId: string; created: boolean; itemCount: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

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
  const template = courseTemplateFromSnapshot(data);
  if (!template) return null;
  const ownCourseId = (data as { ownCourseId?: unknown }).ownCourseId;
  return { ownCourseId: typeof ownCourseId === "string" ? ownCourseId : null, template };
}

/**
 * Adds a shared course to the student's account through the join_course_share SECURITY DEFINER
 * function, which copies the template in one transaction and is the only writer of
 * courses.joined_from_share_id. Joining the same share again returns the course from the first
 * join; the owner gets their own course back.
 */
export async function joinCourseShare(supabase: SupabaseClient, token: unknown): Promise<JoinShareResult> {
  if (!isShareToken(token)) return { status: "not_found" };
  const { data, error } = await supabase.rpc("join_course_share", { share_token: token });
  if (error) throw new Error(`Unable to add course: ${error.message}`);
  const result = data as { courseId?: unknown; created?: unknown; itemCount?: unknown } | null;
  if (!result || typeof result.courseId !== "string") return { status: "not_found" };
  return {
    status: "joined",
    courseId: result.courseId,
    created: result.created === true,
    itemCount: typeof result.itemCount === "number" ? result.itemCount : 0,
  };
}
