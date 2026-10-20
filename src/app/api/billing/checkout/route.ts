import { NextRequest, NextResponse } from "next/server";
import { isEntitlementActive, isProPlan } from "@personal-agent/core";
import { siteUrl } from "@/lib/site-url";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { stripeCheckoutConfigured, stripePriceIds } from "@/lib/subscription/config";
import { loadEntitlement, toProEntitlement } from "@/lib/subscription/entitlements";
import { getStripe } from "@/lib/subscription/stripe";

export const runtime = "nodejs";

// Web only: starts a Stripe Checkout session for Atlas Pro and returns its URL ({ url }). The mobile
// app buys through the App Store / Play (RevenueCat) instead. The webhook, not this route, grants Pro.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const stripe = getStripe();
  if (!stripe || !stripeCheckoutConfigured()) {
    return NextResponse.json({ error: "Atlas Pro is coming soon.", code: "billing_not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  if (!isProPlan(body?.plan)) {
    return NextResponse.json({ error: "Choose the monthly or yearly plan." }, { status: 400 });
  }
  const plan = body.plan;
  const price = stripePriceIds()[plan]!;

  const existing = await loadEntitlement(auth.supabase, auth.user.id);
  // Already Pro (from either store): don't start a second subscription.
  if (isEntitlementActive(toProEntitlement(existing))) {
    return NextResponse.json({ error: "You already have Atlas Pro.", code: "already_pro" }, { status: 409 });
  }

  try {
    // Reuse the Stripe customer from an earlier subscription so the portal shows one history.
    const base = siteUrl().replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: auth.user.id,
      metadata: { user_id: auth.user.id },
      subscription_data: { metadata: { user_id: auth.user.id } },
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : auth.user.email
          ? { customer_email: auth.user.email }
          : {}),
      allow_promotion_codes: true,
      success_url: `${base}/pro?checkout=success&plan=${plan}`,
      cancel_url: `${base}/pro?checkout=canceled`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing] checkout failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 502 });
  }
}
