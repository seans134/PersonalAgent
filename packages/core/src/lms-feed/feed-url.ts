// The LMS calendar feed link. It carries a secret token (anyone with it can read the student's
// calendar), so it is treated like a password: the server stores it, clients only ever see
// maskLmsFeedUrl's host-only form, and it never goes into logs, analytics or error messages.

export type LmsProvider = "canvas" | "brightspace" | "moodle" | "blackboard" | "other";

export type LmsFeedErrorCode =
  | "invalid_url"
  | "blocked_address"
  | "unreachable"
  | "timeout"
  | "rejected"
  | "http_error"
  | "too_large"
  | "not_calendar"
  | "too_many_events"
  | "too_many_redirects"
  /** Atlas failed while saving the sync (a database error), not a problem with the feed. */
  | "internal";

export const LMS_FEED_ERROR_CODES: readonly LmsFeedErrorCode[] = [
  "invalid_url",
  "blocked_address",
  "unreachable",
  "timeout",
  "rejected",
  "http_error",
  "too_large",
  "not_calendar",
  "too_many_events",
  "too_many_redirects",
  "internal",
];

/** Student-facing copy per error. Never includes the link itself. */
export const LMS_FEED_ERROR_MESSAGES: Record<LmsFeedErrorCode, string> = {
  invalid_url: "Paste the full calendar feed link from your school's LMS. It starts with https:// or webcal://.",
  blocked_address: "That link doesn't point to a public calendar feed.",
  unreachable: "Atlas couldn't reach your LMS. Check the link and try again.",
  timeout: "Your LMS took too long to respond. Try again in a minute.",
  rejected:
    "Your LMS didn't accept this feed link. It may have been reset; copy a fresh one from your LMS calendar settings.",
  http_error: "Your LMS returned an error. Try again later.",
  too_large: "That calendar feed is too large to import (over 5 MB).",
  not_calendar: "That link didn't return a calendar. Make sure you copied the calendar feed (.ics) link.",
  too_many_events: "That calendar feed has too many events to import.",
  too_many_redirects: "That link redirected too many times.",
  internal: "Atlas couldn't finish syncing your feed. Try again in a few minutes.",
};

export function lmsFeedErrorMessage(code: LmsFeedErrorCode): string {
  return LMS_FEED_ERROR_MESSAGES[code];
}

export function isLmsFeedErrorCode(value: unknown): value is LmsFeedErrorCode {
  return typeof value === "string" && (LMS_FEED_ERROR_CODES as readonly string[]).includes(value);
}

export const LMS_FEED_MAX_URL_LENGTH = 2048;
/** Courses opens trigger a sync when the last one is older than this. */
export const LMS_FEED_STALE_MS = 12 * 60 * 60 * 1000;
/** Minimum gap between two sync attempts (manual or automatic). */
export const LMS_FEED_MIN_SYNC_INTERVAL_MS = 60 * 1000;

/** Quick client-side check before sending (no URL parsing, so it runs the same on React Native). */
export function looksLikeLmsFeedUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= LMS_FEED_MAX_URL_LENGTH && /^(https|webcals?):\/\/[^\s/?#]+\.[^\s/?#]+[^\s]*$/i.test(trimmed);
}

export type NormalizedLmsFeedUrl = { ok: true; url: string; host: string } | { ok: false; code: "invalid_url" };

/**
 * Validates a pasted feed link: https only (webcal:// is rewritten to https://), no user:password,
 * default port only, and a dotted host name. Hash fragments are dropped.
 */
export function normalizeLmsFeedUrl(value: unknown): NormalizedLmsFeedUrl {
  if (typeof value !== "string") return { ok: false, code: "invalid_url" };
  let trimmed = value.trim();
  if (!trimmed || trimmed.length > LMS_FEED_MAX_URL_LENGTH || /\s/.test(trimmed)) return { ok: false, code: "invalid_url" };
  if (/^webcals?:\/\//i.test(trimmed)) trimmed = trimmed.replace(/^webcals?:\/\//i, "https://");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return { ok: false, code: "invalid_url" };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[")) return { ok: false, code: "invalid_url" };
  parsed.hash = "";
  return { ok: true, url: parsed.toString(), host };
}

/** The host of a stored feed link, or null when it doesn't parse. */
export function lmsFeedHost(url: string): string | null {
  const normalized = normalizeLmsFeedUrl(url);
  return normalized.ok ? normalized.host : null;
}

/** What clients see instead of the link: the host and a mask, never the path or query (they hold the token). */
export function maskLmsFeedUrl(url: string): string {
  const host = lmsFeedHost(url);
  return host ? `https://${host}/••••••` : "••••••";
}

/** Best guess at the LMS from the feed's host, for the "Canvas feed" label. */
export function detectLmsProvider(host: string | null): LmsProvider {
  const value = (host ?? "").toLowerCase();
  if (/instructure\.com$|(^|[.-])canvas([.-]|$)/.test(value)) return "canvas";
  if (/brightspace|desire2learn|(^|[.-])d2l([.-]|$)/.test(value)) return "brightspace";
  if (/moodle/.test(value)) return "moodle";
  if (/blackboard|(^|[.-])bb([.-]|$)/.test(value)) return "blackboard";
  return "other";
}

export const LMS_PROVIDER_LABELS: Record<LmsProvider, string> = {
  canvas: "Canvas",
  brightspace: "Brightspace",
  moodle: "Moodle",
  blackboard: "Blackboard",
  other: "LMS",
};

/** True when there's never been a successful sync or the last one is older than LMS_FEED_STALE_MS. */
export function isLmsFeedStale(lastSyncedAt: string | null, now: Date): boolean {
  if (!lastSyncedAt) return true;
  const last = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= LMS_FEED_STALE_MS;
}

/**
 * Removes anything that looks like a URL from a message before it is shown, stored or logged, so
 * a library error that echoes the request can't leak the feed token.
 */
export function redactUrls(message: string): string {
  return message.replace(/\b(?:https?|webcals?):\/\/[^\s"'<>]+/gi, "[link]");
}
