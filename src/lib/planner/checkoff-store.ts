import { dateInTimezone, shiftDate } from "@personal-agent/core/calendar";
import { isPlanDateInWindow, studyDoneMinutesByItem } from "@personal-agent/core/planner";
import type {
  PlanAcceptRequest,
  PlanAcceptResponse,
  PlanItemStatus,
  PlanItemStatusRequest,
  PlanItemStatusResponse,
  PlanStatusResponse,
} from "@personal-agent/core/planner";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type StatusRow = { item_key: string; status: PlanItemStatus };

/** The student's profile timezone (same default the planner uses). */
export async function profileTimezoneForUser(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.from("user_profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Unable to load profile: ${error.message}`);
  return (data as { timezone?: string | null } | null)?.timezone ?? "America/Toronto";
}

/** The student's local date today, from their profile timezone. */
export async function todayPlanDateForUser(supabase: SupabaseClient, userId: string): Promise<string> {
  return dateInTimezone(new Date(), await profileTimezoneForUser(supabase, userId));
}

/** Rejects plan dates outside the student's local today ±1 day. Returns an error message, or null when allowed. */
export async function planDateWindowError(supabase: SupabaseClient, userId: string, planDate: string): Promise<string | null> {
  const today = await todayPlanDateForUser(supabase, userId);
  return isPlanDateInWindow(planDate, today) ? null : "planDate must be within a day of today.";
}

export async function readPlanCheckoff(supabase: SupabaseClient, userId: string, planDate: string): Promise<PlanStatusResponse> {
  const [statusesResult, acceptanceResult] = await Promise.all([
    supabase.from("plan_item_statuses").select("item_key, status").eq("user_id", userId).eq("plan_date", planDate),
    supabase.from("plan_acceptances").select("accepted_at").eq("user_id", userId).eq("plan_date", planDate).maybeSingle(),
  ]);
  if (statusesResult.error) throw new Error(`Unable to load plan check-offs: ${statusesResult.error.message}`);
  if (acceptanceResult.error) throw new Error(`Unable to load plan acceptance: ${acceptanceResult.error.message}`);

  const statuses: Record<string, PlanItemStatus> = {};
  for (const row of (statusesResult.data ?? []) as StatusRow[]) statuses[row.item_key] = row.status;
  const acceptance = acceptanceResult.data as { accepted_at: string } | null;
  return { planDate, statuses, acceptedAt: acceptance?.accepted_at ?? null };
}

export async function writePlanItemStatus(
  supabase: SupabaseClient,
  userId: string,
  input: PlanItemStatusRequest,
): Promise<PlanItemStatusResponse> {
  if (input.status === null) {
    const { error } = await supabase
      .from("plan_item_statuses")
      .delete()
      .eq("user_id", userId)
      .eq("plan_date", input.planDate)
      .eq("item_key", input.itemKey);
    if (error) throw new Error(`Unable to clear plan check-off: ${error.message}`);
  } else {
    const { error } = await supabase.from("plan_item_statuses").upsert(
      {
        user_id: userId,
        plan_date: input.planDate,
        item_key: input.itemKey,
        item_type: input.itemType,
        status: input.status,
        minutes: input.status === "done" ? (input.minutes ?? null) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plan_date,item_key" },
    );
    if (error) throw new Error(`Unable to save plan check-off: ${error.message}`);
  }
  return { planDate: input.planDate, itemKey: input.itemKey, status: input.status };
}

/** How far back done study blocks count toward an item's ramp (the longest ramp is 7 days). */
const STUDY_DONE_LOOKBACK_DAYS = 14;

/**
 * Study minutes checked off as done before today, per course item id.
 * Only rows that recorded minutes count (rows saved before minutes were sent have none).
 */
export async function readStudyDoneMinutes(
  supabase: SupabaseClient,
  userId: string,
  todayPlanDate: string,
): Promise<Record<string, number>> {
  const since = shiftDate(todayPlanDate, -STUDY_DONE_LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from("plan_item_statuses")
    .select("item_key, plan_date, status, minutes")
    .eq("user_id", userId)
    .eq("item_type", "study")
    .eq("status", "done")
    .gte("plan_date", since)
    .lt("plan_date", todayPlanDate);
  if (error) throw new Error(`Unable to load study check-offs: ${error.message}`);
  return studyDoneMinutesByItem(
    (data ?? []) as Array<{ item_key: string; plan_date: string; status: PlanItemStatus; minutes: number | null }>,
    todayPlanDate,
  );
}

/** Records the commitment once per plan date; accepting again keeps the first time and returns created: false. */
export async function acceptPlan(supabase: SupabaseClient, userId: string, input: PlanAcceptRequest): Promise<PlanAcceptResponse> {
  // ON CONFLICT DO NOTHING ... RETURNING: a row comes back only when this request created it.
  const { data: inserted, error } = await supabase
    .from("plan_acceptances")
    .upsert(
      { user_id: userId, plan_date: input.planDate, item_count: input.itemCount },
      { onConflict: "user_id,plan_date", ignoreDuplicates: true },
    )
    .select("accepted_at");
  if (error) throw new Error(`Unable to accept plan: ${error.message}`);

  const insertedRow = ((inserted ?? []) as Array<{ accepted_at: string }>)[0];
  if (insertedRow) return { planDate: input.planDate, acceptedAt: insertedRow.accepted_at, created: true };

  const { data, error: readError } = await supabase
    .from("plan_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("plan_date", input.planDate)
    .maybeSingle();
  if (readError) throw new Error(`Unable to load plan acceptance: ${readError.message}`);
  const acceptedAt = (data as { accepted_at: string } | null)?.accepted_at;
  if (!acceptedAt) throw new Error("Unable to accept plan.");
  return { planDate: input.planDate, acceptedAt, created: false };
}
