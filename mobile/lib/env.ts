const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const authRedirectUrl = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? "atlas://auth/callback";
const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const websiteUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;

export function getMobileEnv() {
  return {
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
    authRedirectUrl,
    posthogApiKey,
    posthogHost,
    sentryDsn,
    websiteUrl,
    isConfigured: Boolean(supabaseUrl && supabaseAnonKey && apiBaseUrl),
  };
}

export function requireMobileEnv() {
  const env = getMobileEnv();

  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.apiBaseUrl) {
    throw new Error(
      "Missing mobile environment variables. Set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and EXPO_PUBLIC_API_BASE_URL.",
    );
  }

  return {
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    apiBaseUrl: env.apiBaseUrl,
    authRedirectUrl: env.authRedirectUrl,
  };
}
