import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planEntitlementWrite, type EntitlementRow, type EntitlementUpdate } from "./entitlements";
import { entitlementFromRevenueCatEvent, revenueCatUserId, verifyRevenueCatAuthorization } from "./revenuecat";
import { entitlementFromStripeSubscription, stripeEntitlementStatus } from "./stripe";
import { planForStripePrice, proLimitsEnforced, stripeCheckoutConfigured } from "./config";

const USER = "11111111-2222-4333-8444-555555555555";
const now = new Date("2026-10-20T12:00:00Z");

function row(patch: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    user_id: USER,
    source: "stripe",
    status: "active",
    plan: "monthly",
    product_id: "price_month",
    current_period_end: "2026-11-20T12:00:00.000Z",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    revenuecat_app_user_id: null,
    last_event_at: "2026-10-20T10:00:00.000Z",
    ...patch,
  };
}

function update(patch: Partial<EntitlementUpdate> = {}): EntitlementUpdate {
  return {
    userId: USER,
    source: "stripe",
    status: "active",
    plan: "yearly",
    productId: "price_year",
    currentPeriodEnd: "2027-10-20T12:00:00.000Z",
    eventAt: "2026-10-20T11:00:00.000Z",
    ...patch,
  };
}

beforeEach(() => {
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_month");
  vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_year");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("planEntitlementWrite", () => {
  it("creates the row for a first purchase", () => {
    const plan = planEntitlementWrite(null, update({ stripeCustomerId: "cus_9" }), now);
    expect(plan).toEqual({
      action: "write",
      row: expect.objectContaining({ source: "stripe", status: "active", plan: "yearly", stripe_customer_id: "cus_9" }),
    });
  });

  it("skips an event older than the last one applied from the same store", () => {
    expect(planEntitlementWrite(row(), update({ eventAt: "2026-10-20T09:00:00.000Z" }), now)).toEqual({
      action: "skip",
      reason: "stale",
    });
  });

  it("keeps customer ids the update doesn't mention", () => {
    const plan = planEntitlementWrite(row(), update({ status: "expired" }), now);
    expect(plan.action === "write" && plan.row).toMatchObject({ status: "expired", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" });
  });

  it("doesn't let one store end Pro bought through the other", () => {
    const fromApp = row({ source: "revenuecat", revenuecat_app_user_id: USER, stripe_customer_id: null });
    const plan = planEntitlementWrite(fromApp, update({ status: "expired", stripeCustomerId: "cus_2" }), now);
    expect(plan.action === "write" && plan.row).toMatchObject({
      source: "revenuecat",
      status: "active",
      stripe_customer_id: "cus_2",
    });
  });

  it("keeps a renewing subscription when the other store sends a canceled one, even with a later end", () => {
    // Stripe renews Nov 20; an app-store subscription the student canceled still runs to Dec 20.
    const plan = planEntitlementWrite(
      row(),
      update({ source: "revenuecat", status: "canceled", currentPeriodEnd: "2026-12-20T12:00:00.000Z", revenueCatAppUserId: USER }),
      now,
    );
    expect(plan.action === "write" && plan.row).toMatchObject({ source: "stripe", status: "active", revenuecat_app_user_id: USER });
  });

  it("keeps the existing active subscription when the other store's ends sooner", () => {
    const plan = planEntitlementWrite(row(), update({ source: "revenuecat", currentPeriodEnd: "2026-11-01T12:00:00.000Z" }), now);
    expect(plan.action === "write" && plan.row).toMatchObject({ source: "stripe", plan: "monthly" });
  });

  it("switches stores when the other store's active subscription runs later, or renews where the existing one is canceled", () => {
    const later = planEntitlementWrite(row(), update({ source: "revenuecat" }), now);
    expect(later.action === "write" && later.row).toMatchObject({ source: "revenuecat", plan: "yearly" });

    const renews = planEntitlementWrite(
      row({ status: "canceled", current_period_end: "2026-12-20T12:00:00.000Z" }),
      update({ source: "revenuecat", currentPeriodEnd: "2026-11-25T12:00:00.000Z" }),
      now,
    );
    expect(renews.action === "write" && renews.row).toMatchObject({ source: "revenuecat", status: "active" });
  });

  it("lets an active purchase from the other store take over", () => {
    const expiredApp = row({ source: "revenuecat", status: "expired" });
    const plan = planEntitlementWrite(expiredApp, update(), now);
    expect(plan.action === "write" && plan.row).toMatchObject({ source: "stripe", status: "active", plan: "yearly" });
  });
});

describe("Stripe mapping", () => {
  it("maps subscription statuses", () => {
    expect(stripeEntitlementStatus({ status: "active" })).toBe("active");
    expect(stripeEntitlementStatus({ status: "active", cancel_at_period_end: true })).toBe("canceled");
    expect(stripeEntitlementStatus({ status: "trialing" })).toBe("trialing");
    expect(stripeEntitlementStatus({ status: "past_due" })).toBe("past_due");
    for (const status of ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
      expect(stripeEntitlementStatus({ status })).toBe("expired");
    }
  });

  it("reads price, plan and period end from the subscription item", () => {
    const result = entitlementFromStripeSubscription(
      {
        id: "sub_1",
        customer: { id: "cus_1" },
        status: "active",
        items: { data: [{ price: { id: "price_year" }, current_period_end: 1_824_120_000 }] },
      },
      USER,
      1_792_500_000,
    );
    expect(result).toEqual({
      userId: USER,
      source: "stripe",
      status: "active",
      plan: "yearly",
      productId: "price_year",
      currentPeriodEnd: new Date(1_824_120_000 * 1000).toISOString(),
      eventAt: new Date(1_792_500_000 * 1000).toISOString(),
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
  });

  it("falls back to the subscription's period end and marks deletions expired", () => {
    const result = entitlementFromStripeSubscription(
      { id: "sub_1", customer: "cus_1", status: "active", current_period_end: 1_800_000_000, items: { data: [] } },
      USER,
      1_792_500_000,
      { deleted: true },
    );
    expect(result).toMatchObject({ status: "expired", plan: null, currentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
  });
});

describe("RevenueCat", () => {
  it("checks the Authorization header", () => {
    expect(verifyRevenueCatAuthorization("Bearer s3cret", "s3cret")).toBe(true);
    expect(verifyRevenueCatAuthorization("s3cret", "s3cret")).toBe(true);
    expect(verifyRevenueCatAuthorization("Bearer wrong", "s3cret")).toBe(false);
    expect(verifyRevenueCatAuthorization(null, "s3cret")).toBe(false);
    expect(verifyRevenueCatAuthorization("Bearer s3cret", null)).toBe(false);
  });

  it("finds the Supabase user id, skipping anonymous ids", () => {
    expect(revenueCatUserId({ id: "e", type: "RENEWAL", app_user_id: "$RCAnonymousID:abc", aliases: [USER] })).toBe(USER);
    expect(revenueCatUserId({ id: "e", type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" })).toBeNull();
  });

  it("maps purchase, cancellation, billing issue and expiration events", () => {
    const base = {
      id: "evt",
      app_user_id: USER,
      product_id: "atlas_pro_yearly",
      entitlement_ids: ["pro"],
      expiration_at_ms: Date.parse("2027-10-20T00:00:00Z"),
      event_timestamp_ms: Date.parse("2026-10-20T00:00:00Z"),
    };
    expect(entitlementFromRevenueCatEvent({ ...base, type: "INITIAL_PURCHASE" })).toEqual({
      userId: USER,
      source: "revenuecat",
      status: "active",
      plan: "yearly",
      productId: "atlas_pro_yearly",
      currentPeriodEnd: "2027-10-20T00:00:00.000Z",
      eventAt: "2026-10-20T00:00:00.000Z",
      revenueCatAppUserId: USER,
    });
    expect(entitlementFromRevenueCatEvent({ ...base, type: "INITIAL_PURCHASE", period_type: "TRIAL" })?.status).toBe("trialing");
    expect(entitlementFromRevenueCatEvent({ ...base, type: "CANCELLATION" })?.status).toBe("canceled");
    expect(entitlementFromRevenueCatEvent({ ...base, type: "BILLING_ISSUE" })?.status).toBe("past_due");
    expect(entitlementFromRevenueCatEvent({ ...base, type: "EXPIRATION" })?.status).toBe("expired");
  });

  it("ignores test events, other entitlements and anonymous users", () => {
    const base = { id: "evt", app_user_id: USER, entitlement_ids: ["pro"] };
    expect(entitlementFromRevenueCatEvent({ ...base, type: "TEST" })).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...base, type: "RENEWAL", entitlement_ids: ["other"] })).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...base, type: "RENEWAL", app_user_id: "$RCAnonymousID:x" })).toBeNull();
  });

  it("requires the event to name the Pro entitlement", () => {
    const base = { id: "evt", type: "INITIAL_PURCHASE", app_user_id: USER };
    expect(entitlementFromRevenueCatEvent(base)).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...base, entitlement_ids: null })).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...base, entitlement_ids: [] })).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...base, entitlement_id: "pro" })?.status).toBe("active");
  });

  it("ignores sandbox events unless REVENUECAT_ALLOW_SANDBOX is true", () => {
    const sandbox = { id: "evt", type: "INITIAL_PURCHASE", app_user_id: USER, entitlement_ids: ["pro"], environment: "SANDBOX" };
    expect(entitlementFromRevenueCatEvent(sandbox)).toBeNull();
    expect(entitlementFromRevenueCatEvent({ ...sandbox, environment: "PRODUCTION" })?.status).toBe("active");
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "true");
    expect(entitlementFromRevenueCatEvent(sandbox)?.status).toBe("active");
  });
});

describe("config", () => {
  it("keeps limits off unless PRO_ENFORCE_LIMITS is true", () => {
    expect(proLimitsEnforced()).toBe(false);
    vi.stubEnv("PRO_ENFORCE_LIMITS", "false");
    expect(proLimitsEnforced()).toBe(false);
    vi.stubEnv("PRO_ENFORCE_LIMITS", "true");
    expect(proLimitsEnforced()).toBe(true);
  });

  it("needs every Stripe key before checkout is offered", () => {
    expect(stripeCheckoutConfigured()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    expect(stripeCheckoutConfigured()).toBe(true);
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "");
    expect(stripeCheckoutConfigured()).toBe(false);
  });

  it("maps price ids to plans", () => {
    expect(planForStripePrice("price_month")).toBe("monthly");
    expect(planForStripePrice("price_year")).toBe("yearly");
    expect(planForStripePrice("price_other")).toBeNull();
  });
});
