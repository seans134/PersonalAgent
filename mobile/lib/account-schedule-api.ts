import { requireMobileEnv } from "./env";
export async function accountScheduleRequest<T>(token: string, path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const env = requireMobileEnv();
  const response = await fetch(`${env.apiBaseUrl}${path}`, { method: options.method ?? "GET", headers: { Authorization: `Bearer ${token}`, ...(!options.form && options.body ? { "Content-Type": "application/json" } : {}) }, body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined) });
  const data = await response.json().catch(() => ({ error: "Unable to read server response." }));
  if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data as T;
}
