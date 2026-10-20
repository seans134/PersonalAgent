import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementSource, EntitlementStatus, ProEntitlement, ProPlan } from "@personal-agent/core";
import { isEntitlementActive } from "@personal-agent/core";

// The user_entitlements row (supabase/migrations/20261020210000_pro_subscription.sql). Students read
// their own row through RLS; only the service role writes it, from the verified webhooks.

export type EntitlementRow = {
  user_id: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  plan: ProPlan | null;
  product_id: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  revenuecat_app_user_id: string | null;
  last_event_at: string | null;
};

const ENTITLEMENT_COLUMNS =
  "user_id, source, status, plan, product_id, current_period_end, stripe_customer_id, stripe_subscription_id, revenuecat_app_user_id, last_event_at";

/** What a webhook learned about one student's subscription. */
export type EntitlementUpdate = {
  userId: string;
  source: EntitlementSource;
  status: EntitlementStatus;
  plan: ProPlan | null;
  productId: string | null;
  currentPeriodEnd: string | null;
  /** When the store produced the event (ISO); orders late deliveries. */
  eventAt: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  revenueCatAppUserId?: string | null;
};

export function toProEntitlement(row: EntitlementRow | null): ProEntitlement | null {
  if (!row) return null;
  return { source: row.source, status: row.status, plan: row.plan, currentPeriodEnd: row.current_period_end };
}

/** The student's entitlement, or null when they have none (or the table isn't there yet). */
export async function loadEntitlement(supabase: SupabaseClient, userId: string): Promise<EntitlementRow | null> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Before the migration is applied the table is missing; everyone is simply free.
    console.warn("[subscription] unable to read entitlement", error.message);
    return null;
  }
  return (data as EntitlementRow | null) ?? null;
}

export const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a webhook's user reference looks like a Supabase user id (anything else is skipped). */
export function isUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

/**
 * Whether an update from one store replaces an active entitlement from the other. Both have to be
 * active, and the incoming one has to be better: the existing one is canceled and the incoming one
 * renews, or (unless the incoming one is canceled while the existing one renews) it runs later.
 */
export function crossStoreTakesOver(existing: EntitlementRow, incoming: EntitlementRow, now: Date = new Date()): boolean {
  if (!isEntitlementActive(toProEntitlement(incoming), now)) return false;
  const existingRenews = existing.status !== "canceled";
  const incomingRenews = incoming.status !== "canceled";
  if (!existingRenews && incomingRenews) return true;
  if (existingRenews && !incomingRenews) return false;
  if (!incoming.current_period_end || !existing.current_period_end) return false;
  return Date.parse(incoming.current_period_end) > Date.parse(existing.current_period_end);
}

export type EntitlementWritePlan =
  | { action: "write"; row: EntitlementRow }
  | { action: "skip"; reason: "stale" };

/**
 * How an update lands on the stored row (pure):
 * - An event older than the newest one applied from the same store is ignored (late delivery).
 * - While the row is an active entitlement from the other store, the update only takes over when
 *   it is the better subscription (see crossStoreTakesOver); otherwise just its customer ids are
 *   merged in. So a "not Pro" or "canceled" event from one store never ends or downgrades Pro the
 *   student is still paying for through the other.
 * - Otherwise the update replaces the row, keeping customer ids it doesn't mention.
 */
export function planEntitlementWrite(
  existing: EntitlementRow | null,
  update: EntitlementUpdate,
  now: Date = new Date(),
): EntitlementWritePlan {
  const ids = {
    stripe_customer_id: update.stripeCustomerId ?? existing?.stripe_customer_id ?? null,
    stripe_subscription_id: update.stripeSubscriptionId ?? existing?.stripe_subscription_id ?? null,
    revenuecat_app_user_id: update.revenueCatAppUserId ?? existing?.revenuecat_app_user_id ?? null,
  };

  if (existing && existing.source === update.source && existing.last_event_at) {
    if (Date.parse(update.eventAt) < Date.parse(existing.last_event_at)) return { action: "skip", reason: "stale" };
  }

  const incoming: EntitlementRow = {
    user_id: update.userId,
    source: update.source,
    status: update.status,
    plan: update.plan,
    product_id: update.productId,
    current_period_end: update.currentPeriodEnd,
    ...ids,
    last_event_at: update.eventAt,
  };

  if (
    existing &&
    existing.source !== update.source &&
    isEntitlementActive(toProEntitlement(existing), now) &&
    !crossStoreTakesOver(existing, incoming, now)
  ) {
    return { action: "write", row: { ...existing, ...ids } };
  }

  return { action: "write", row: incoming };
}

/** Applies a webhook's update with the service-role client. Returns false when it was skipped. */
export async function upsertEntitlement(admin: SupabaseClient, update: EntitlementUpdate, now: Date = new Date()): Promise<boolean> {
  const { data: existing, error: readError } = await admin
    .from("user_entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", update.userId)
    .maybeSingle();
  if (readError) throw new Error(`Unable to read entitlement: ${readError.message}`);

  const plan = planEntitlementWrite((existing as EntitlementRow | null) ?? null, update, now);
  if (plan.action === "skip") return false;

  const { error } = await admin
    .from("user_entitlements")
    .upsert({ ...plan.row, updated_at: now.toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Unable to save entitlement: ${error.message}`);
  return true;
}

/** The student a Stripe customer belongs to, from an earlier checkout. */
export async function findUserIdByStripeCustomer(admin: SupabaseClient, customerId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("user_entitlements")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Unable to look up customer: ${error.message}`);
  return (data as { user_id: string } | null)?.user_id ?? null;
}

// ---- Webhook idempotency (billing_webhook_events) ----

const UNIQUE_VIOLATION = "23505";

/**
 * Records a delivery before it's applied. "duplicate" means it was already applied (or is being
 * applied by a concurrent delivery) and must be acknowledged without doing anything.
 */
export async function claimWebhookEvent(
  admin: SupabaseClient,
  provider: EntitlementSource,
  eventId: string,
  eventType: string,
): Promise<"claimed" | "duplicate"> {
  const { error } = await admin
    .from("billing_webhook_events")
    .insert({ id: `${provider}:${eventId}`, provider, event_type: eventType.slice(0, 100) });
  if (!error) return "claimed";
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  throw new Error(`Unable to record webhook event: ${error.message}`);
}

/** Forgets a claimed delivery whose processing failed, so the store's retry is applied. */
export async function releaseWebhookEvent(admin: SupabaseClient, provider: EntitlementSource, eventId: string) {
  const { error } = await admin.from("billing_webhook_events").delete().eq("id", `${provider}:${eventId}`);
  if (error) console.error("[subscription] unable to release webhook event", error.message);
}
