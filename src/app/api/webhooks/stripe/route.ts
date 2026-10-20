import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeWebhookSecret } from "@/lib/subscription/config";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/subscription/entitlements";
import { HANDLED_STRIPE_EVENTS, getStripe, handleStripeEvent, type StripeSubscriptionLike } from "@/lib/subscription/stripe";

export const runtime = "nodejs";

// Stripe webhook: verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET, then upserts the
// student's entitlement for checkout.session.completed and customer.subscription.updated / .deleted.
// Each event id is applied once (billing_webhook_events); a failed apply is released so Stripe's retry
// runs it again.
export async function POST(request: NextRequest) {
  const secret = stripeWebhookSecret();
  const stripe = getStripe();
  if (!secret || !stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  // The signature covers the raw body, so read it as text before any JSON parsing.
  const payload = await request.text();
  let event: { id: string; type: string; created: number; data: { object: unknown } };
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (!HANDLED_STRIPE_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, result: "ignored" });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server is not configured to save subscriptions." }, { status: 503 });
  }

  try {
    if ((await claimWebhookEvent(admin, "stripe", event.id, event.type)) === "duplicate") {
      return NextResponse.json({ received: true, result: "duplicate" });
    }
  } catch (error) {
    console.error("[billing] stripe webhook claim failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to process event." }, { status: 500 });
  }

  try {
    const result = await handleStripeEvent(event, {
      admin,
      retrieveSubscription: async (id) => (await stripe.subscriptions.retrieve(id)) as unknown as StripeSubscriptionLike,
    });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("[billing] stripe webhook failed", event.type, error instanceof Error ? error.message : error);
    await releaseWebhookEvent(admin, "stripe", event.id);
    return NextResponse.json({ error: "Unable to process event." }, { status: 500 });
  }
}
