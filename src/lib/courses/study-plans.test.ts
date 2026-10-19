import { describe, expect, it, vi } from "vitest";
import { shiftDate } from "@personal-agent/core/calendar";
import type { CourseItemRow } from "./types";

const { fetchAllMock } = vi.hoisted(() => ({ fetchAllMock: vi.fn() }));

vi.mock("@/lib/planner/checkoff-store", () => ({
  profileTimezoneForUser: async () => "UTC",
  readStudyDoneMinutes: async () => ({}),
}));
vi.mock("./queries", () => ({ fetchAllCourseItems: fetchAllMock }));

const today = new Date().toISOString().slice(0, 10);
const row = (id: string, courseId: string, overrides: Partial<CourseItemRow>): CourseItemRow => ({
  id, course_id: courseId, category_id: null, user_id: "u1", kind: "exam", title: id,
  due_at: `${shiftDate(today, 4)}T15:00:00.000Z`, end_at: null, location: null, score_earned: null, score_max: 100,
  estimated_effort_hours: null, focus_mode: "continuous", created_at: `${today}T00:00:00.000Z`,
  ...overrides,
} as CourseItemRow);

describe("studyPlansForCourseItems", () => {
  it("holds a deferred exam back while another course has a finish_first item", async () => {
    const { studyPlansForCourseItems } = await import("./study-plans");
    const courseItems = [row("deferred-exam", "c1", { focus_mode: "deferred" }), row("exam", "c1", {})];
    fetchAllMock.mockResolvedValue([...courseItems, row("other-ff", "c2", { kind: "assignment", focus_mode: "finish_first" })]);
    const plans = await studyPlansForCourseItems({} as never, "u1", courseItems);
    expect(plans?.todayLocalDate).toBe(today);
    expect(Object.keys(plans?.byItemId ?? {})).toEqual(["exam"]);
  });
});
