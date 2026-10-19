/** A same-origin relative path to continue to after auth, or null (guards against open redirects). */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : null;
}
