import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementStatus } from "@personal-agent/core";
import { planForStripePrice, stripeSecretKey } from "./config";
import { findUserIdByStripeCustomer, isUserId, upsertEntitlement, type EntitlementUpdate } from "./entitlements";

/** The Stripe client, or null when STRIPE_SECRET_KEY isn't set. */
export function getStripe(): Stripe | null {
  const key = stripeSecretKey();
  return key ? new Stripe(key) : null;
}

// The parts of Stripe objects the webhook reads. Kept structural so the mapping is testable without
// building full Stripe objects. Period end moved from the subscription to its items in newer API
// versions, so both are read.
type Expandable = string | { id: string } | null | undefined;

export type StripeSubscriptionLike = {
  id: string;
  customer: Expandable;
  status: string;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string> | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ price?: { id?: string } | null; current_period_end?: number | null }> } | null;
};

export type StripeCheckoutSessionLike = {
  mode?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  customer?: Expandable;
  subscription?: Expandable;
};

export type StripeEventLike = { id: string; type: string; created: number; data: { object: unknown } };

export const HANDLED_STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function expandableId(value: Expandable): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Stripe subscription status -> entitlement status. */
export function stripeEntitlementStatus(subscription: Pick<StripeSubscriptionLike, "status" | "cancel_at_period_end">): EntitlementStatus {
  switch (subscription.status) {
    case "active":
      return subscription.cancel_at_period_end ? "canceled" : "active";
    case "trialing":
      return subscription.cancel_at_period_end ? "canceled" : "trialing";
    case "past_due":
      return "past_due";
    // unpaid, canceled, incomplete, incomplete_expired, paused: not Pro.
    default:
      return "expired";
  }
}

export function entitlementFromStripeSubscription(
  subscription: StripeSubscriptionLike,
  userId: string,
  eventCreated: number,
  options: { deleted?: boolean } = {},
): EntitlementUpdate {
  const item = subscription.items?.data?.[0];
  const productId = item?.price?.id ?? null;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end ?? null;
  return {
    userId,
    source: "stripe",
    status: options.deleted ? "expired" : stripeEntitlementStatus(subscription),
    plan: planForStripePrice(productId),
    productId,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    eventAt: new Date(eventCreated * 1000).toISOString(),
    stripeCustomerId: expandableId(subscription.customer),
    stripeSubscriptionId: subscription.id,
  };
}

export type StripeWebhookDeps = {
  admin: SupabaseClient;
  retrieveSubscription: (id: string) => Promise<StripeSubscriptionLike>;
};

export type StripeEventResult = "applied" | "skipped" | "ignored";

/** Applies one verified Stripe event to the entitlement table. */
export async function handleStripeEvent(event: StripeEventLike, deps: StripeWebhookDeps): Promise<StripeEventResult> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as StripeCheckoutSessionLike;
    const subscriptionId = expandableId(session.subscription);
    const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
    // Not a Supabase user id: acknowledged and skipped (retrying can't fix it).
    if (session.mode !== "subscription" || !subscriptionId || !isUserId(userId)) return "ignored";
    // The session doesn't carry the price or period; read the subscription as it is now.
    const subscription = await deps.retrieveSubscription(subscriptionId);
    const update = entitlementFromStripeSubscription(subscription, userId, event.created);
    // Only Atlas Pro prices grant Pro; other subscriptions on the Stripe account are not ours.
    if (!update.plan) return "ignored";
    update.stripeCustomerId = expandableId(session.customer) ?? update.stripeCustomerId;
    return (await upsertEntitlement(deps.admin, update)) ? "applied" : "skipped";
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as StripeSubscriptionLike;
    const customerId = expandableId(subscription.customer);
    const metadataUserId = subscription.metadata?.user_id;
    if (metadataUserId !== undefined && !isUserId(metadataUserId)) return "ignored";
    const userId = metadataUserId ?? (customerId ? await findUserIdByStripeCustomer(deps.admin, customerId) : null);
    if (!isUserId(userId)) return "ignored";
    const update = entitlementFromStripeSubscription(subscription, userId, event.created, {
      deleted: event.type === "customer.subscription.deleted",
    });
    if (!update.plan) return "ignored";
    return (await upsertEntitlement(deps.admin, update)) ? "applied" : "skipped";
  }

  return "ignored";
}
