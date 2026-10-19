import { NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { verifyAccountPassword } from "@/lib/supabase/verify-password";
import { siteUrl } from "@/lib/site-url";
export async function POST(request: Request) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    if (body.action === "password") {
      if (typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword !== body.confirmPassword) throw new Error("Use at least 8 characters and matching new passwords.");
      const client = await verifyAccountPassword(auth.user, body.currentPassword);
      try { const { error } = await client.auth.updateUser({ password: body.newPassword }); if (error) throw new Error(error.message); }
      finally { await client.auth.signOut({ scope: "local" }); }
      return NextResponse.json({ message: "Password changed. Use your new password next time you sign in." });
    }
    if (body.action === "email") {
      if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new Error("Enter a valid email.");
      const client = await verifyAccountPassword(auth.user, body.currentPassword);
      try { const { error } = await client.auth.updateUser({ email: body.email.trim() }, { emailRedirectTo: body.platform === "mobile" ? "atlas://auth/callback" : `${siteUrl()}/profile` }); if (error) throw new Error(error.message); }
      finally { await client.auth.signOut({ scope: "local" }); }
      return NextResponse.json({ message: "Check your inboxes to confirm the email change. Your current email remains active until confirmation." });
    }
    if (body.action === "recovery") {
      const redirectTo = body.platform === "mobile" ? "atlas://auth/callback" : `${siteUrl()}/auth/callback?next=/auth/update-password`;
      const { error } = await auth.supabase.auth.resetPasswordForEmail(auth.user.email!, { redirectTo });
      if (error) throw new Error("Unable to send recovery email. Please try again later.");
      return NextResponse.json({ message: "Password recovery email sent." });
    }
    throw new Error("Unknown account action.");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update account." }, { status: 400 }); }
}
