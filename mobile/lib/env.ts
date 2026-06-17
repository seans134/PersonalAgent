const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export function getMobileEnv() {
  return {
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
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
  };
}
