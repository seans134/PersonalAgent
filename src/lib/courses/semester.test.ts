import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/planner/checkoff-store", () => ({ profileTimezoneForUser: async () => "America/Toronto" }));

function fakeSupabase(rows: Record<string, unknown[]>) {
  const calls: Array<[string, string, unknown[]]> = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([table, method, args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
    return builder;
  };
  return { supabase: { from } as never, calls };
}

describe("loadSemesterTimeline", () => {
  it("builds the timeline from active courses in the profile timezone", async () => {
    const { loadSemesterTimeline } = await import("./semester");
    const { supabase, calls } = fakeSupabase({
      courses: [{ id: "c1", name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026" }],
      course_categories: [{ id: "ex", course_id: "c1", weight: "40" }],
      course_items: [{
        // 01:00 UTC on Oct 26 is still Sunday Oct 25 in Toronto, so it stays in the current week.
        id: "mid", course_id: "c1", category_id: "ex", kind: "exam", title: "Midterm",
        due_at: "2026-10-26T01:00:00.000Z", score_earned: null, score_max: "50", estimated_effort_hours: "4",
      }],
    });
    const timeline = await loadSemesterTimeline(supabase, "u1", null, new Date("2026-10-21T16:00:00.000Z"));
    expect(calls).toContainEqual(["courses", "is", ["archived_at", null]]);
    expect(timeline.term).toBe("Fall 2026");
    expect(timeline.weeks).toHaveLength(1);
    expect(timeline.weeks[0].items[0]).toMatchObject({
      dueLocalDate: "2026-10-25", courseLabel: "CHEM 201", weightPercent: 40, effortHours: 4,
    });
  });
});
