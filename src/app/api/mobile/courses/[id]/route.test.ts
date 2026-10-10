import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, getCourseDetailMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  getCourseDetailMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));
vi.mock("@/lib/courses/queries", () => ({ getCourseDetail: getCourseDetailMock }));

const course = {
  id: "c1", user_id: "u1", name: "Organic Chemistry", code: null, color: null, term: null,
  target_grade: 85, archived_at: null, created_at: "2026-09-01T00:00:00Z",
};
const category = (id: string, weight: number) => ({
  id, course_id: "c1", user_id: "u1", name: id, weight, position: 0, created_at: "2026-09-01T00:00:00Z",
});
const item = (id: string, categoryId: string, scoreEarned: number | null) => ({
  id, course_id: "c1", category_id: categoryId, user_id: "u1", kind: "assignment", title: id,
  due_at: "2026-10-01T12:00:00Z", end_at: null, location: null, score_earned: scoreEarned, score_max: 100,
  estimated_effort_hours: null, focus_mode: "continuous", created_at: "2026-09-01T00:00:00Z",
});

async function callGet(id: string) {
  const { GET } = await import("./route");
  const response = await GET(new NextRequest(`http://localhost/api/mobile/courses/${id}`, { method: "GET" }), {
    params: Promise.resolve({ id }),
  });
  if (!response) throw new Error("Route returned no response.");
  return response;
}

describe("GET /api/mobile/courses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockResolvedValue({ supabase: {}, user: { id: "u1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const response = await callGet("c1");
    expect(response.status).toBe(401);
  });

  it("returns the course detail with grade and needed score", async () => {
    getCourseDetailMock.mockResolvedValue({
      course,
      categories: [category("hw", 50), category("exam", 50)],
      items: [item("hw1", "hw", 80), item("final", "exam", null)],
    });
    const response = await callGet("c1");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["categories", "course", "grade", "items", "needed"]);
    expect(body.grade.average).toBeCloseTo(80, 9);
    expect(body.needed.status).toBe("needed");
    expect(body.needed.neededPercent).toBeCloseTo(90, 9);
    expect(body.needed.remainingWeight).toBeCloseTo(50, 9);
  });

  it("returns 404 for a missing course", async () => {
    getCourseDetailMock.mockResolvedValue(null);
    const response = await callGet("nope");
    expect(response.status).toBe(404);
  });
});
