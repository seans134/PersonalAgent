import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));

type Result = { data: unknown; error: { message: string } | null };

/** Chainable query mock per table: every builder method returns the builder, which
 *  is awaitable (and maybeSingle resolves) to that table's result. Calls are recorded. */
function supabaseMock(results: Record<string, Result>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const result = results[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "upsert", "delete"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => result;
      builder.then = (resolve: (value: Result) => void) => resolve(result);
      return builder;
    },
  };
  return { client, calls };
}

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const statusUrl = "http://localhost/api/mobile/plan/status";

describe("GET /api/mobile/plan/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(request("GET", statusUrl))).status).toBe(401);
  });

  it("rejects a malformed date", async () => {
    getAuthMock.mockResolvedValue({ supabase: supabaseMock({}).client, user: { id: "user-1" } });
    const { GET } = await import("./route");
    expect((await GET(request("GET", `${statusUrl}?date=2026-13-01`))).status).toBe(400);
  });

  it("returns statuses keyed by item and the acceptance for the date", async () => {
    const { client, calls } = supabaseMock({
      plan_item_statuses: {
        data: [
          { item_key: "study:item-1", status: "done" },
          { item_key: "goal:read", status: "skipped" },
        ],
        error: null,
      },
      plan_acceptances: { data: { accepted_at: "2026-10-19T13:00:00.000Z" }, error: null },
    });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { GET } = await import("./route");
    const response = await GET(request("GET", `${statusUrl}?date=2026-10-19`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      planDate: "2026-10-19",
      statuses: { "study:item-1": "done", "goal:read": "skipped" },
      acceptedAt: "2026-10-19T13:00:00.000Z",
    });
    expect(calls).toContainEqual({ table: "plan_item_statuses", method: "eq", args: ["user_id", "user-1"] });
    expect(calls).toContainEqual({ table: "plan_item_statuses", method: "eq", args: ["plan_date", "2026-10-19"] });
  });

  it("defaults to the student's local today", async () => {
    const { client } = supabaseMock({
      user_profiles: { data: { timezone: "UTC" }, error: null },
      plan_item_statuses: { data: [], error: null },
      plan_acceptances: { data: null, error: null },
    });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { GET } = await import("./route");
    const body = await (await GET(request("GET", statusUrl))).json();
    expect(body).toEqual({ planDate: new Date().toISOString().slice(0, 10), statuses: {}, acceptedAt: null });
  });
});

describe("PUT /api/mobile/plan/status", () => {
  beforeEach(() => vi.clearAllMocks());

  const valid = { planDate: "2026-10-19", itemKey: "study:item-1", itemType: "study", status: "done" };

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const { PUT } = await import("./route");
    expect((await PUT(request("PUT", statusUrl, valid))).status).toBe(401);
  });

  it("rejects an invalid status", async () => {
    getAuthMock.mockResolvedValue({ supabase: supabaseMock({}).client, user: { id: "user-1" } });
    const { PUT } = await import("./route");
    const response = await PUT(request("PUT", statusUrl, { ...valid, status: "maybe" }));
    expect(response.status).toBe(400);
  });

  it("upserts a mark for the signed-in student", async () => {
    const { client, calls } = supabaseMock({ plan_item_statuses: { data: null, error: null } });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { PUT } = await import("./route");
    const response = await PUT(request("PUT", statusUrl, valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ planDate: "2026-10-19", itemKey: "study:item-1", status: "done" });
    const upsert = calls.find((call) => call.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({
      user_id: "user-1",
      plan_date: "2026-10-19",
      item_key: "study:item-1",
      item_type: "study",
      status: "done",
    });
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id,plan_date,item_key" });
  });

  it("deletes the mark on undo", async () => {
    const { client, calls } = supabaseMock({ plan_item_statuses: { data: null, error: null } });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { PUT } = await import("./route");
    const response = await PUT(request("PUT", statusUrl, { ...valid, status: null }));
    expect(await response.json()).toEqual({ planDate: "2026-10-19", itemKey: "study:item-1", status: null });
    expect(calls.some((call) => call.method === "delete")).toBe(true);
    expect(calls).toContainEqual({ table: "plan_item_statuses", method: "eq", args: ["item_key", "study:item-1"] });
  });

  it("returns 500 when the write fails", async () => {
    const { client } = supabaseMock({ plan_item_statuses: { data: null, error: { message: "boom" } } });
    getAuthMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { PUT } = await import("./route");
    expect((await PUT(request("PUT", statusUrl, valid))).status).toBe(500);
  });
});
