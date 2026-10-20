import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { loadSubscriptionStatus } from "@/lib/subscription/usage";

// Returns SubscriptionStatusResponse (packages/core/src/subscription): whether the student is Pro, the
// stored entitlement, this term's syllabus import usage, and which purchase paths the server has.
// Web and mobile both read Pro status from here; mobile never trusts the store SDK alone.
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await loadSubscriptionStatus(auth.supabase, auth.user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load your subscription.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
