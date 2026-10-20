import type { ProPlan } from "@personal-agent/core";

// Atlas Pro server settings. Every key is optional: with none set, checkout and the webhooks answer
// "not configured", the paywall says Pro is coming soon, and the free-tier limit is off.

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** The free-tier syllabus import limit is enforced only when PRO_ENFORCE_LIMITS is "true" (default off). */
export function proLimitsEnforced(): boolean {
  return env("PRO_ENFORCE_LIMITS")?.toLowerCase() === "true";
}

export function stripePriceIds(): Record<ProPlan, string | null> {
  return { monthly: env("STRIPE_PRICE_PRO_MONTHLY"), yearly: env("STRIPE_PRICE_PRO_YEARLY") };
}

export function stripeSecretKey(): string | null {
  return env("STRIPE_SECRET_KEY");
}

export function stripeWebhookSecret(): string | null {
  return env("STRIPE_WEBHOOK_SECRET");
}

/** Web checkout needs the secret key, both price ids, the webhook secret, and the service role key. */
export function stripeCheckoutConfigured(): boolean {
  const prices = stripePriceIds();
  return Boolean(
    stripeSecretKey() && prices.monthly && prices.yearly && stripeWebhookSecret() && env("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

/** The plan a Stripe price id belongs to, from STRIPE_PRICE_PRO_MONTHLY / _YEARLY. */
export function planForStripePrice(priceId: string | null | undefined): ProPlan | null {
  if (!priceId) return null;
  const prices = stripePriceIds();
  if (priceId === prices.monthly) return "monthly";
  if (priceId === prices.yearly) return "yearly";
  return null;
}

/** Shared secret RevenueCat sends in the webhook's Authorization header. */
export function revenueCatWebhookAuth(): string | null {
  return env("REVENUECAT_WEBHOOK_AUTH");
}

/**
 * Whether RevenueCat SANDBOX events (TestFlight, Xcode, Play license testers) may grant Pro. Off by
 * default so free sandbox purchases never unlock Pro in production; set
 * REVENUECAT_ALLOW_SANDBOX=true only on a staging/preview host used for store testing.
 */
export function revenueCatSandboxAllowed(): boolean {
  return env("REVENUECAT_ALLOW_SANDBOX")?.toLowerCase() === "true";
}

/** RevenueCat entitlement identifier that means Atlas Pro (default "pro"). */
export function revenueCatEntitlementId(): string {
  return env("REVENUECAT_ENTITLEMENT_ID") ?? "pro";
}
