import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleOAuthConfig } from "@/lib/google/config";

const OAUTH_STATE_COOKIE = "atlas_google_oauth_state";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL("/calendar?error=oauth_state_mismatch", request.url));
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    const errorMessage = tokenData.error_description ?? tokenData.error ?? "oauth_failed";
    return NextResponse.redirect(new URL(`/calendar?error=${encodeURIComponent(errorMessage)}`, request.url));
  }

  const existing = await supabase
    .from("google_calendar_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const refreshToken = tokenData.refresh_token ?? (existing.data as { refresh_token?: string } | null)?.refresh_token ?? null;
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const { error: upsertError } = await supabase.from("google_calendar_tokens").upsert(
    {
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_type: tokenData.token_type ?? "Bearer",
      scope: tokenData.scope ?? null,
      expires_at: expiresAt,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return NextResponse.redirect(new URL(`/calendar?error=${encodeURIComponent(upsertError.message)}`, request.url));
  }

  const response = NextResponse.redirect(new URL("/calendar?connected=1", request.url));
  response.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/calendar/callback" });
  return response;
}
