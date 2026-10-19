import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, loadTimelineMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  loadTimelineMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));
vi.mock("@/lib/courses/semester", () => ({ loadSemesterTimeline: loadTimelineMock }));

const timeline = {
  todayLocalDate: "2026-10-21",
  term: "Fall 2026",
  terms: ["Fall 2026", "Winter 2027"],
  weeks: [{
    weekStart: "2026-10-19", weekEnd: "2026-10-25", isCurrent: true, loadHours: 6, examCount: 1, isCrunch: false,
    items: [{
      id: "mid", courseId: "c1", courseLabel: "CHEM 201", kind: "exam", title: "Midterm", dueAt: "2026-10-23T14:00:00Z",
      dueLocalDate: "2026-10-23", weightPercent: 25, effortHours: 6, isDone: false,
    }],
  }],
  pastWeeks: [],
  laterItems: [],
  medianLoadHours: 6,
  crunchWeekCount: 0,
};

async function callGet(query = "") {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/mobile/semester${query}`, { method: "GET" }));
}

describe("GET /api/mobile/semester", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockResolvedValue({ supabase: {}, user: { id: "u1" } });
    loadTimelineMock.mockResolvedValue(timeline);
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const response = await callGet();
    expect(response.status).toBe(401);
    expect(loadTimelineMock).not.toHaveBeenCalled();
  });

  it("returns the timeline for the default term", async () => {
    const response = await callGet();
    expect(response.status).toBe(200);
    expect(loadTimelineMock).toHaveBeenCalledWith({}, "u1", null);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      ["crunchWeekCount", "laterItems", "medianLoadHours", "pastWeeks", "term", "terms", "todayLocalDate", "weeks"],
    );
    expect(body.weeks[0].items[0]).toMatchObject({ id: "mid", courseId: "c1", weightPercent: 25 });
  });

  it("passes ?term= through", async () => {
    await callGet("?term=Winter%202027");
    expect(loadTimelineMock).toHaveBeenCalledWith({}, "u1", "Winter 2027");
  });

  it("returns 500 with a message when loading fails", async () => {
    loadTimelineMock.mockRejectedValue(new Error("Unable to load courses: boom"));
    const response = await callGet();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load courses: boom" });
  });
});
