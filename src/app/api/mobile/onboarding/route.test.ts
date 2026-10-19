import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedRequestClientMock } = vi.hoisted(() => ({
  getAuthenticatedRequestClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({
  getAuthenticatedRequestClient: getAuthenticatedRequestClientMock,
}));

function profileClient(row: Record<string, unknown> | null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  return { from: vi.fn(() => query) };
}

function request() {
  return new NextRequest("http://localhost/api/mobile/onboarding", {
    method: "GET",
    headers: { Authorization: "Bearer token" },
  });
}

describe("GET /api/mobile/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the saved planner preferences", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({
      supabase: profileClient({
        work_start_time: "08:30:00",
        work_end_time: "18:00:00",
        focus_block_minutes: 45,
        workout_preference: "moderate",
      }),
      user: { id: "user-1" },
    });
    const { GET } = await import("./route");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profile: { workStartTime: "08:30", workEndTime: "18:00", focusBlockMinutes: 45, workoutPreference: "moderate" },
    });
  });

  it("returns a null profile before one exists", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: profileClient(null), user: { id: "user-1" } });
    const { GET } = await import("./route");
    expect(await (await GET(request())).json()).toEqual({ profile: null });
  });
});
