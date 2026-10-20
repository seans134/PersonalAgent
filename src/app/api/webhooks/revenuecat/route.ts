import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revenueCatWebhookAuth } from "@/lib/subscription/config";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/subscription/entitlements";
import { handleRevenueCatEvent, verifyRevenueCatAuthorization, type RevenueCatWebhookBody } from "@/lib/subscription/revenuecat";

export const runtime = "nodejs";

// RevenueCat webhook: checks the Authorization header against REVENUECAT_WEBHOOK_AUTH, then upserts the
// student's entitlement (app_user_id is the Supabase user id). Each event id is applied once.
export async function POST(request: NextRequest) {
  const secret = revenueCatWebhookAuth();
  if (!secret) return NextResponse.json({ error: "RevenueCat is not configured." }, { status: 503 });

  if (!verifyRevenueCatAuthorization(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RevenueCatWebhookBody | null;
  const event = body?.event;
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server is not configured to save subscriptions." }, { status: 503 });
  }

  try {
    if ((await claimWebhookEvent(admin, "revenuecat", event.id, event.type)) === "duplicate") {
      return NextResponse.json({ received: true, result: "duplicate" });
    }
  } catch (error) {
    console.error("[billing] revenuecat webhook claim failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to process event." }, { status: 500 });
  }

  try {
    const result = await handleRevenueCatEvent(event, { admin });
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("[billing] revenuecat webhook failed", event.type, error instanceof Error ? error.message : error);
    await releaseWebhookEvent(admin, "revenuecat", event.id);
    return NextResponse.json({ error: "Unable to process event." }, { status: 500 });
  }
}
