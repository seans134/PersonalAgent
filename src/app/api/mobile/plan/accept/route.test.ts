import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));

type Result = { data: unknown; error: { message: string } | null };

// The profile timezone is UTC in these mocks, so "today" is the UTC date.
const today = new Date().toISOString().slice(0, 10);
const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

/** plan_acceptances: awaiting the upsert chain gives `upsertResult`; maybeSingle gives `readResult`. */
function supabaseMock(upsertResult: Result, readResult: Result = { data: null, error: null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "upsert"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => (table === "user_profiles" ? { data: { timezone: "UTC" }, error: null } : readResult);
      builder.then = (resolve: (value: Result) => void) => resolve(upsertResult);
      return builder;
    },
  };
  return { client, calls };
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/mobile/plan/accept", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mobile/plan/accept", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: today, itemCount: 3 }))).status).toBe(401);
  });

  it("rejects a bad body", async () => {
    getAuthMock.mockResolvedValue({ supabase: supabaseMock({ data: [], error: null }).client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: "yesterday", itemCount: 3 }))).status).toBe(400);
  });

  it("rejects a date more than a day from the student's today", async () => {
    getAuthMock.mockResolvedValue({ supabase: supabaseMock({ data: [], error: null }).client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: threeDaysAgo, itemCount: 3 }))).status).toBe(400);
  });

  it("records the first acceptance with created: true", async () => {
    const { client, calls } = supabaseMock({ data: [{ accepted_at: "2026-10-19T13:00:00.000Z" }], error: null });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    const response = await POST(request({ planDate: today, itemCount: 3 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ planDate: today, acceptedAt: "2026-10-19T13:00:00.000Z", created: true });
    const upsert = calls.find((call) => call.method === "upsert");
    expect(upsert?.args).toEqual([
      { user_id: "user-1", plan_date: today, item_count: 3 },
      { onConflict: "user_id,plan_date", ignoreDuplicates: true },
    ]);
  });

  it("returns the existing acceptance with created: false when already accepted", async () => {
    const { client } = supabaseMock(
      { data: [], error: null },
      { data: { accepted_at: "2026-10-19T09:00:00.000Z" }, error: null },
    );
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    const response = await POST(request({ planDate: today, itemCount: 3 }));
    expect(await response.json()).toEqual({ planDate: today, acceptedAt: "2026-10-19T09:00:00.000Z", created: false });
  });

  it("returns 500 when the write fails", async () => {
    const { client } = supabaseMock({ data: null, error: { message: "boom" } });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: today, itemCount: 3 }))).status).toBe(500);
  });
});
