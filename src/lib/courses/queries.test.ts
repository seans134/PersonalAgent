import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCourseSummaries } from "./queries";

type Rows = Record<string, unknown[]>;

// Chainable Supabase mock that resolves each table to its own rows.
function makeSupabase(rows: Rows) {
  return {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "order"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
      return builder;
    }),
  };
}

const course = {
  id: "c1", user_id: "u1", name: "Organic Chemistry", code: "CHEM 201", color: null, term: "Fall 2026",
  target_grade: 85, archived_at: null, created_at: "2026-09-01T00:00:00Z",
};

function item(
  id: string, dueAt: string, scoreEarned: number | null, categoryId: string | null = null, kind = "assignment",
) {
  return {
    id, course_id: "c1", category_id: categoryId, user_id: "u1", kind, title: id, due_at: dueAt,
    end_at: null, location: null, score_earned: scoreEarned, score_max: 100, estimated_effort_hours: null,
    focus_mode: "continuous", created_at: "2026-09-01T00:00:00Z",
  };
}

describe("listCourseSummaries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts ungraded items due in the next 7 days per course", async () => {
    const supabase = makeSupabase({
      courses: [course],
      course_categories: [],
      course_items: [
        item("past", "2026-10-08T12:00:00Z", null),
        item("graded", "2026-10-11T12:00:00Z", 90),
        item("soon", "2026-10-12T12:00:00Z", null),
        item("friday", "2026-10-16T12:00:00Z", null),
        item("later", "2026-10-30T12:00:00Z", null),
      ],
    });

    const [summary] = await listCourseSummaries(supabase as never, "u1");

    expect(summary.dueThisWeek).toBe(2);
    expect(summary.nextItem).toMatchObject({ id: "soon" });
    expect(summary.nextExam).toBeNull();
  });

  it("reports the soonest ungraded upcoming exam as nextExam", async () => {
    const supabase = makeSupabase({
      courses: [course],
      course_categories: [],
      course_items: [
        item("old-exam", "2026-10-01T12:00:00Z", null, null, "exam"),
        item("graded-exam", "2026-10-11T12:00:00Z", 88, null, "exam"),
        item("ps", "2026-10-12T12:00:00Z", null),
        item("midterm", "2026-10-20T14:00:00Z", "0" as never, null, "exam"),
        item("final", "2026-12-10T14:00:00Z", null, null, "exam"),
      ],
    });

    const [summary] = await listCourseSummaries(supabase as never, "u1");

    // A numeric-string zero from Postgres still counts as graded.
    expect(summary.nextExam).toEqual({ id: "final", title: "final", dueAt: "2026-12-10T14:00:00Z" });
    expect(summary.nextItem).toMatchObject({ id: "ps" });
  });

  it("includes the average needed on the rest to hit the target", async () => {
    const category = (id: string, weight: string) => ({
      id, course_id: "c1", user_id: "u1", name: id, weight, position: 0, created_at: "2026-09-01T00:00:00Z",
    });
    const supabase = makeSupabase({
      // target_grade 85; weights arrive as numeric strings from Postgres.
      courses: [course],
      course_categories: [category("hw", "50"), category("exam", "50")],
      course_items: [
        item("hw1", "2026-10-01T12:00:00Z", 80, "hw"),
        item("final", "2026-12-10T12:00:00Z", null, "exam"),
      ],
    });

    const [summary] = await listCourseSummaries(supabase as never, "u1");

    expect(summary.needed.status).toBe("needed");
    if (summary.needed.status !== "needed") return;
    expect(summary.needed.neededPercent).toBeCloseTo(90, 9);
    expect(summary.needed.remainingWeight).toBeCloseTo(50, 9);
  });

  it("reports no_target for a course without a target grade", async () => {
    const supabase = makeSupabase({
      courses: [{ ...course, target_grade: null }],
      course_categories: [],
      course_items: [],
    });

    const [summary] = await listCourseSummaries(supabase as never, "u1");

    expect(summary.needed).toEqual({ status: "no_target" });
  });
});
