export type ParsedAuthDeepLink = {
  handled: boolean;
  recovery: boolean;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
};

export function parseAuthDeepLink(url: string): ParsedAuthDeepLink {
  try {
    const parsed = new URL(url);
    const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const code = parsed.searchParams.get("code");
    const accessToken = hash.get("access_token") ?? parsed.searchParams.get("access_token");
    const refreshToken = hash.get("refresh_token") ?? parsed.searchParams.get("refresh_token");
    const type = hash.get("type") ?? parsed.searchParams.get("type");
    const error = hash.get("error_description") ?? parsed.searchParams.get("error_description");
    const handled = Boolean(code || (accessToken && refreshToken) || error);

    return {
      handled,
      recovery: type === "recovery",
      code,
      accessToken,
      refreshToken,
      error,
    };
  } catch {
    return {
      handled: false,
      recovery: false,
      code: null,
      accessToken: null,
      refreshToken: null,
      error: null,
    };
  }
}
