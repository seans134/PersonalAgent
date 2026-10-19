import { dateInTimezone } from "@personal-agent/core/calendar";
import { upcomingStudyRamps, type CourseStudyPlans } from "@personal-agent/core";
import type { createClient } from "@/lib/supabase/server";
import { profileTimezoneForUser, readStudyDoneMinutes } from "@/lib/planner/checkoff-store";
import { courseItemsToStudyItems } from "./projection";
import type { CourseItemRow } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The study ramp ("Study plan") for each unscored upcoming exam and quiz in the list, keyed by
 * item id, from the same core function and done-study check-offs the Today plan uses.
 * Best effort: without study progress the ramp starts from the full estimate, and when the
 * profile can't be read this returns null so the course page still loads.
 */
export async function studyPlansForCourseItems(
  supabase: SupabaseClient,
  userId: string,
  items: CourseItemRow[],
): Promise<CourseStudyPlans | null> {
  let timezone: string;
  try {
    timezone = await profileTimezoneForUser(supabase, userId);
  } catch {
    return null;
  }
  const today = dateInTimezone(new Date(), timezone);
  if (!items.some((item) => item.kind !== "assignment" && item.score_earned === null)) {
    return { todayLocalDate: today, byItemId: {} };
  }
  let doneMinutes: Record<string, number> = {};
  try {
    doneMinutes = await readStudyDoneMinutes(supabase, userId, today);
  } catch {
    doneMinutes = {};
  }
  return {
    todayLocalDate: today,
    byItemId: upcomingStudyRamps(courseItemsToStudyItems(items, new Map(), timezone), today, doneMinutes),
  };
}
