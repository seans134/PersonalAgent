import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const generateTodayPlanForUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/planner/plan-today", () => ({
  generateTodayPlanForUser: generateTodayPlanForUserMock,
}));

describe("POST /api/plan/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
    });

    const { POST } = await import("./route");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Authentication required." });
  });

  it("returns planner response for authenticated user", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } } }),
      },
    });

    generateTodayPlanForUserMock.mockResolvedValue({
      status: 200,
      body: {
        plan: { items: [], constrained: false },
        meta: {
          goalsCount: 1,
          eventsCount: 2,
          generatedAt: "2026-03-04T00:00:00.000Z",
          warnings: [],
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generateTodayPlanForUserMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: "user-1",
    });
    expect(body.meta.goalsCount).toBe(1);
  });
});
