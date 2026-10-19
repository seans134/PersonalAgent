import { parseAuthDeepLink } from "@personal-agent/core";
import { supabase } from "./supabase";

export type AuthDeepLinkResult = {
  handled: boolean;
  recovery: boolean;
  error?: string;
};

/**
 * `onSignIn` runs just before a non-recovery link creates a session (e.g. an
 * email confirmation), so the app can treat it as a real sign-in.
 */
export async function handleAuthDeepLink(url: string, onSignIn?: () => void): Promise<AuthDeepLinkResult> {
  const parameters = parseAuthDeepLink(url);

  if (parameters.error) {
    return { handled: true, recovery: false, error: parameters.error };
  }

  const recovery = parameters.recovery;
  const willCreateSession = Boolean(parameters.code || (parameters.accessToken && parameters.refreshToken));
  if (willCreateSession && !recovery) onSignIn?.();

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
