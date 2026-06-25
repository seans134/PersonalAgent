import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

async function revokeGoogleAccess(admin: ReturnType<typeof createAdminClient>, userId: string) {
  try {
    const { data } = await admin
      .from("google_calendar_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    const token = data?.refresh_token ?? data?.access_token;
    if (!token) return;

    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Account deletion must still proceed if Google is unavailable.
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as { confirmation?: unknown };
  if (payload.confirmation !== "DELETE") {
    return NextResponse.json({ error: "Account deletion confirmation is required." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    await revokeGoogleAccess(admin, auth.user.id);
    const { error } = await admin.auth.admin.deleteUser(auth.user.id, false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete account.";
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
