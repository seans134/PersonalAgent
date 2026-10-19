import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));

type Result = { data: unknown; error: { message: string } | null };

function supabaseMock(result: Result, readResult: Result) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const client = {
    from() {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "upsert"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => readResult;
      builder.then = (resolve: (value: Result) => void) => resolve(result);
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
    expect((await POST(request({ planDate: "2026-10-19", itemCount: 3 }))).status).toBe(401);
  });

  it("rejects a bad body", async () => {
    const { client } = supabaseMock({ data: null, error: null }, { data: null, error: null });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: "yesterday", itemCount: 3 }))).status).toBe(400);
  });

  it("records the acceptance once and returns the first acceptance time", async () => {
    const { client, calls } = supabaseMock(
      { data: null, error: null },
      { data: { accepted_at: "2026-10-19T13:00:00.000Z" }, error: null },
    );
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    const response = await POST(request({ planDate: "2026-10-19", itemCount: 3 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ planDate: "2026-10-19", acceptedAt: "2026-10-19T13:00:00.000Z" });
    const upsert = calls.find((call) => call.method === "upsert");
    expect(upsert?.args).toEqual([
      { user_id: "user-1", plan_date: "2026-10-19", item_count: 3 },
      { onConflict: "user_id,plan_date", ignoreDuplicates: true },
    ]);
  });

  it("returns 500 when the write fails", async () => {
    const { client } = supabaseMock({ data: null, error: { message: "boom" } }, { data: null, error: null });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    expect((await POST(request({ planDate: "2026-10-19", itemCount: 3 }))).status).toBe(500);
  });
});
