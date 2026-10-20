import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inferProPlan, type EntitlementStatus } from "@personal-agent/core";
import { revenueCatEntitlementId, revenueCatSandboxAllowed } from "./config";
import { isUserId, upsertEntitlement, type EntitlementUpdate } from "./entitlements";

// RevenueCat webhook (https://www.revenuecat.com/docs/integrations/webhooks). The mobile app logs in
// to RevenueCat with the Supabase user id, so app_user_id is the student's id.

/**
 * Whether the request's Authorization header matches REVENUECAT_WEBHOOK_AUTH. RevenueCat sends the
 * configured value verbatim; "Bearer <secret>" and the bare secret are both accepted. Compared in
 * constant time.
 */
export function verifyRevenueCatAuthorization(header: string | null, secret: string | null): boolean {
  if (!header || !secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const received = digest(header.trim());
  const candidates = [secret, `Bearer ${secret}`];
  let ok = false;
  for (const candidate of candidates) {
    // Check every candidate so timing doesn't reveal which form matched.
    if (timingSafeEqual(received, digest(candidate))) ok = true;
  }
  return ok;
}

export type RevenueCatEvent = {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  period_type?: string | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  /** "PRODUCTION" or "SANDBOX". */
  environment?: string | null;
};

export type RevenueCatWebhookBody = { api_version?: string; event?: RevenueCatEvent };

const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "REFUND_REVERSED",
]);

/** The Supabase user id on an event (anonymous RevenueCat ids are skipped). */
export function revenueCatUserId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return candidates.find(isUserId) ?? null;
}

function statusFor(event: RevenueCatEvent): EntitlementStatus | null {
  if (ACTIVE_EVENTS.has(event.type)) return event.period_type === "TRIAL" ? "trialing" : "active";
  if (event.type === "CANCELLATION" || event.type === "SUBSCRIPTION_PAUSED") return "canceled";
  if (event.type === "BILLING_ISSUE") return "past_due";
  if (event.type === "EXPIRATION") return "expired";
  // TEST, TRANSFER and anything newer: acknowledged, nothing to store.
  return null;
}

/** The entitlement update an event implies, or null when it doesn't concern Atlas Pro. */
export function entitlementFromRevenueCatEvent(event: RevenueCatEvent): EntitlementUpdate | null {
  const status = statusFor(event);
  const userId = revenueCatUserId(event);
  if (!status || !userId) return null;
  // Sandbox purchases cost nothing (TestFlight / license testers); they never grant Pro in production.
  if (event.environment === "SANDBOX" && !revenueCatSandboxAllowed()) return null;

  // Only events that name the Atlas Pro entitlement count; a missing list is not Pro.
  const entitlementIds = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (!entitlementIds.includes(revenueCatEntitlementId())) return null;

  const productId = event.product_id ?? null;
  return {
    userId,
    source: "revenuecat",
    status,
    plan: inferProPlan(productId),
    productId,
    currentPeriodEnd: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
    eventAt: new Date(event.event_timestamp_ms ?? Date.now()).toISOString(),
    revenueCatAppUserId: userId,
  };
}

export async function handleRevenueCatEvent(
  event: RevenueCatEvent,
  deps: { admin: SupabaseClient },
): Promise<"applied" | "skipped" | "ignored"> {
  const update = entitlementFromRevenueCatEvent(event);
  if (!update) return "ignored";
  return (await upsertEntitlement(deps.admin, update)) ? "applied" : "skipped";
}
