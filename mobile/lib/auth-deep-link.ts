import { parseAuthDeepLink } from "@personal-agent/core/auth-deep-link";
import { supabase } from "./supabase";

export type AuthDeepLinkResult = {
  handled: boolean;
  recovery: boolean;
  error?: string;
};

export async function handleAuthDeepLink(url: string): Promise<AuthDeepLinkResult> {
  const parameters = parseAuthDeepLink(url);

  if (parameters.error) {
    return { handled: true, recovery: false, error: parameters.error };
  }

  const recovery = parameters.recovery;

  if (parameters.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parameters.code);
    return { handled: true, recovery, error: error?.message };
  }

  if (parameters.accessToken && parameters.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: parameters.accessToken,
      refresh_token: parameters.refreshToken,
    });
    return { handled: true, recovery, error: error?.message };
  }

  return { handled: parameters.handled, recovery: false };
}
