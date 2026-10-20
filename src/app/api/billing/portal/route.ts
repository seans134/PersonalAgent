import { NextRequest, NextResponse } from "next/server";
import { siteUrl } from "@/lib/site-url";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { loadEntitlement } from "@/lib/subscription/entitlements";
import { getStripe } from "@/lib/subscription/stripe";

export const runtime = "nodejs";

// Web only: a Stripe Customer Portal link ({ url }) to change plan, update the card, or cancel.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Atlas Pro is coming soon.", code: "billing_not_configured" }, { status: 503 });
  }

  const entitlement = await loadEntitlement(auth.supabase, auth.user.id);
  if (!entitlement?.stripe_customer_id) {
    return NextResponse.json({ error: "There's no web subscription on this account." }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: entitlement.stripe_customer_id,
      return_url: `${siteUrl().replace(/\/$/, "")}/pro`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing] portal failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to open billing. Please try again." }, { status: 502 });
  }
}
