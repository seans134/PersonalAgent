import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGpaSummary } from "@personal-agent/core";

const { getAuthMock, loadGpaMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  loadGpaMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));
vi.mock("@/lib/courses/gpa", () => ({ loadGpaSummary: loadGpaMock }));

const summary = buildGpaSummary({
  scaleId: "us_4_0",
  targetGpa: 3.5,
  courses: [
    { id: "bio", name: "Biology", code: "BIO 110", term: "Fall 2025", credits: 4, finalGrade: "A", currentPercent: null, targetPercent: null },
    { id: "chem", name: "Chemistry", code: null, term: "Winter 2026", credits: 4, finalGrade: null, currentPercent: 85, targetPercent: 90 },
    { id: "lab", name: "Lab", code: null, term: "Winter 2026", credits: null, finalGrade: null, currentPercent: 90, targetPercent: null },
  ],
});

async function callGet(query = "") {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/mobile/gpa${query}`, { method: "GET" }));
}

describe("GET /api/mobile/gpa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockResolvedValue({ supabase: {}, user: { id: "u1" } });
    loadGpaMock.mockResolvedValue(summary);
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue(null);
    const response = await callGet();
    expect(response.status).toBe(401);
    expect(loadGpaMock).not.toHaveBeenCalled();
  });

  it("returns the GPA summary", async () => {
    const response = await callGet();
    expect(response.status).toBe(200);
    expect(loadGpaMock).toHaveBeenCalledWith({}, "u1", { targetGpa: null, term: null });
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(
      ["courseCount", "cumulative", "excluded", "needed", "projection", "scale", "scaleMax", "terms"],
    );
    expect(Object.keys(body.cumulative).sort()).toEqual(["credits", "finalCredits", "finalGpa", "gpa", "inProgressCredits"]);
    expect(body.terms[1].courses[0]).toMatchObject({ id: "chem", status: "in_progress", letter: "B", points: 3, credits: 4 });
    expect(body.excluded).toEqual([{ id: "lab", label: "Lab", term: "Winter 2026", reason: "no_credits" }]);
    expect(body.needed).toMatchObject({ status: "needed", term: "Winter 2026", termCredits: 4 });
  });

  it("passes ?target= and ?term= through", async () => {
    await callGet("?target=3.7&term=Winter%202026");
    expect(loadGpaMock).toHaveBeenCalledWith({}, "u1", { targetGpa: 3.7, term: "Winter 2026" });
  });

  it("rejects a non-numeric target", async () => {
    const response = await callGet("?target=abc");
    expect(response.status).toBe(400);
    expect(loadGpaMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a message when loading fails", async () => {
    loadGpaMock.mockRejectedValue(new Error("Unable to load courses: boom"));
    const response = await callGet();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to load courses: boom" });
  });
});
