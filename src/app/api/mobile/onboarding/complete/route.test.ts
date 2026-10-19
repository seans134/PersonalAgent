import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedRequestClientMock } = vi.hoisted(() => ({
  getAuthenticatedRequestClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({
  getAuthenticatedRequestClient: getAuthenticatedRequestClientMock,
}));

function profileClient(existing: string | null) {
  const upsert = vi.fn(async () => ({ error: null }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: existing === null ? null : { onboarding_completed_at: existing },
      error: null,
    })),
    upsert,
  };
  return { client: { from: vi.fn(() => query) }, upsert };
}

function request(method: "GET" | "POST") {
  return new NextRequest("http://localhost/api/mobile/onboarding/complete", {
    method,
    headers: { Authorization: "Bearer token" },
  });
}

describe("/api/mobile/onboarding/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue(null);
    const { GET, POST } = await import("./route");
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await POST(request("POST"))).status).toBe(401);
  });

  it("GET reports a student who has not finished onboarding", async () => {
    const { client } = profileClient(null);
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { GET } = await import("./route");
    const response = await GET(request("GET"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completed: false, completedAt: null });
  });

  it("POST stamps completion the first time, creating the profile row", async () => {
    const { client, upsert } = profileClient(null);
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    const response = await POST(request("POST"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.alreadyCompleted).toBe(false);
    expect(typeof body.completedAt).toBe("string");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", onboarding_completed_at: body.completedAt },
      { onConflict: "user_id" },
    );
  });

  it("POST keeps the original timestamp for students who already finished", async () => {
    const { client, upsert } = profileClient("2026-09-01T12:00:00.000Z");
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const { POST } = await import("./route");
    const response = await POST(request("POST"));
    expect(await response.json()).toEqual({ completedAt: "2026-09-01T12:00:00.000Z", alreadyCompleted: true });
    expect(upsert).not.toHaveBeenCalled();
  });
});
