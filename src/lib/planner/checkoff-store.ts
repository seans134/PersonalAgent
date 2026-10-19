import { dateInTimezone } from "@personal-agent/core/calendar";
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

/** The student's local date today, from their profile timezone (same default the planner uses). */
export async function todayPlanDateForUser(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.from("user_profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Unable to load profile: ${error.message}`);
  const timezone = (data as { timezone?: string | null } | null)?.timezone ?? "America/Toronto";
  return dateInTimezone(new Date(), timezone);
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,plan_date,item_key" },
    );
    if (error) throw new Error(`Unable to save plan check-off: ${error.message}`);
  }
  return { planDate: input.planDate, itemKey: input.itemKey, status: input.status };
}

/** Records the commitment once per plan date; accepting again keeps the first time. */
export async function acceptPlan(supabase: SupabaseClient, userId: string, input: PlanAcceptRequest): Promise<PlanAcceptResponse> {
  const { error } = await supabase
    .from("plan_acceptances")
    .upsert(
      { user_id: userId, plan_date: input.planDate, item_count: input.itemCount },
      { onConflict: "user_id,plan_date", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Unable to accept plan: ${error.message}`);

  const { data, error: readError } = await supabase
    .from("plan_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("plan_date", input.planDate)
    .maybeSingle();
  if (readError) throw new Error(`Unable to load plan acceptance: ${readError.message}`);
  const acceptedAt = (data as { accepted_at: string } | null)?.accepted_at;
  if (!acceptedAt) throw new Error("Unable to accept plan.");
  return { planDate: input.planDate, acceptedAt };
}
