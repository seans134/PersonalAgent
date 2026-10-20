import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, getCourseDetailMock, studyPlansMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  getCourseDetailMock: vi.fn(),
  studyPlansMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));
vi.mock("@/lib/courses/queries", () => ({ getCourseDetail: getCourseDetailMock, COURSE_COLUMNS: "course-columns" }));
vi.mock("@/lib/courses/study-plans", () => ({ studyPlansForCourseItems: studyPlansMock }));

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
    studyPlansMock.mockResolvedValue({ todayLocalDate: "2026-09-25", byItemId: {} });
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
    expect(Object.keys(body).sort()).toEqual(["categories", "course", "grade", "items", "needed", "studyPlans"]);
    expect(body.grade.average).toBeCloseTo(80, 9);
    expect(body.needed.status).toBe("needed");
    expect(body.needed.neededPercent).toBeCloseTo(90, 9);
    expect(body.needed.remainingWeight).toBeCloseTo(50, 9);
  });

  it("includes the study plan for upcoming exams and quizzes", async () => {
    const items = [item("hw1", "hw", 80), { ...item("final", "exam", null), kind: "exam" }];
    getCourseDetailMock.mockResolvedValue({ course, categories: [category("hw", 50), category("exam", 50)], items });
    const ramp = {
      itemId: "final", kind: "exam", leadDays: 7, effortMinutes: 360, doneMinutes: 0, remainingMinutes: 360,
      days: [{ localDate: "2026-09-30", dayNumber: 7, minutes: 75, isToday: false }],
    };
    studyPlansMock.mockResolvedValue({ todayLocalDate: "2026-09-25", byItemId: { final: ramp } });
    const body = await (await callGet("c1")).json();
    expect(studyPlansMock).toHaveBeenCalledWith({}, "u1", items);
    expect(body.studyPlans).toEqual({ todayLocalDate: "2026-09-25", byItemId: { final: ramp } });
  });

  it("returns 404 for a missing course", async () => {
    getCourseDetailMock.mockResolvedValue(null);
    const response = await callGet("nope");
    expect(response.status).toBe(404);
  });
});

/** Records the update payload and filters; resolves .single() to `result`. */
function fakeUpdateClient(result: { data: unknown; error: unknown } = { data: { id: "c1" }, error: null }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "update", "eq", "select"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.single = async () => result;
  return { supabase: builder, calls };
}

async function callPatch(id: string, body: unknown) {
  const { PATCH } = await import("./route");
  const response = await PATCH(
    new NextRequest(`http://localhost/api/mobile/courses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  if (!response) throw new Error("Route returned no response.");
  return response;
}

describe("PATCH /api/mobile/courses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    expect((await callPatch("c1", { credits: 3 })).status).toBe(401);
  });

  it("saves credits and a final letter grade", async () => {
    const { supabase, calls } = fakeUpdateClient({ data: { id: "c1", credits: 3, final_grade_override: "A-" }, error: null });
    getAuthMock.mockResolvedValue({ supabase, user: { id: "u1" } });
    const response = await callPatch("c1", { credits: "3", finalGrade: "a-" });
    expect(response.status).toBe(200);
    expect(calls).toContainEqual(["update", [{ credits: 3, final_grade_override: "A-" }]]);
    expect(calls).toContainEqual(["eq", ["user_id", "u1"]]);
    expect(calls).toContainEqual(["select", ["course-columns"]]);
    expect(await response.json()).toEqual({ course: { id: "c1", credits: 3, final_grade_override: "A-" } });
  });

  it("clears credits and the final grade with null or blank", async () => {
    const { supabase, calls } = fakeUpdateClient();
    getAuthMock.mockResolvedValue({ supabase, user: { id: "u1" } });
    await callPatch("c1", { credits: null, finalGrade: "" });
    expect(calls).toContainEqual(["update", [{ credits: null, final_grade_override: null }]]);
  });

  it("leaves GPA fields alone when they aren't sent", async () => {
    const { supabase, calls } = fakeUpdateClient();
    getAuthMock.mockResolvedValue({ supabase, user: { id: "u1" } });
    await callPatch("c1", { term: "Fall 2026" });
    expect(calls).toContainEqual(["update", [{ term: "Fall 2026" }]]);
  });

  it("rejects out-of-range credits and unknown letters", async () => {
    const { supabase, calls } = fakeUpdateClient();
    getAuthMock.mockResolvedValue({ supabase, user: { id: "u1" } });
    const credits = await callPatch("c1", { credits: 25 });
    expect(credits.status).toBe(400);
    expect(await credits.json()).toEqual({ error: "Credits must be between 0 and 20." });
    const letter = await callPatch("c1", { finalGrade: "E" });
    expect(letter.status).toBe(400);
    expect((await letter.json()).error).toMatch(/letter grade/);
    expect(calls.some(([method]) => method === "update")).toBe(false);
  });
});
