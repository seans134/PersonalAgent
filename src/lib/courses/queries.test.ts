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

function item(id: string, dueAt: string, scoreEarned: number | null) {
  return {
    id, course_id: "c1", category_id: null, user_id: "u1", kind: "assignment", title: id, due_at: dueAt,
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
  });
});
