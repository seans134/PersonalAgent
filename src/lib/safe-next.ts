const BASE = "http://x";

/**
 * A same-origin relative path to continue to after auth, or null (guards against open redirects).
 * Any whitespace or control character is rejected outright (browsers strip tabs and newlines, so
 * "/\t/evil.com" would become "//evil.com"); what's left must resolve on our own origin.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("//") ? null : path;
}
