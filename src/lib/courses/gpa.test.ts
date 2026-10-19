import { describe, expect, it } from "vitest";

function fakeSupabase(rows: Record<string, unknown>) {
  const calls: Array<[string, string, unknown[]]> = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([table, method, args]);
        return builder;
      };
    }
    builder.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
    return builder;
  };
  return { supabase: { from } as never, calls };
}

describe("loadGpaSummary", () => {
  it("builds the summary from all courses on the profile's scale", async () => {
    const { loadGpaSummary } = await import("./gpa");
    const { supabase, calls } = fakeSupabase({
      user_profiles: { gpa_scale: "us_4_3" },
      courses: [
        // Archived past course with its transcript grade.
        { id: "c0", name: "Biology", code: "BIO 110", term: "Fall 2025", target_grade: null, credits: "4", final_grade_override: "A+" },
        { id: "c1", name: "Organic Chemistry", code: "CHEM 201", term: "Winter 2026", target_grade: "90", credits: "3", final_grade_override: null },
      ],
      course_categories: [{ id: "ex", course_id: "c1", name: "Exams", weight: "100" }],
      course_items: [{ course_id: "c1", category_id: "ex", score_earned: "42", score_max: "50" }],
    });
    const summary = await loadGpaSummary(supabase, "u1", { targetGpa: 4 });
    expect(calls.some(([table, method]) => table === "courses" && method === "is")).toBe(false);
    expect(summary.scale).toBe("us_4_3");
    expect(summary.terms[0].courses[0]).toMatchObject({ status: "final", letter: "A+", points: 4.3, credits: 4 });
    expect(summary.terms[1].courses[0]).toMatchObject({ status: "in_progress", letter: "B", percent: 84, credits: 3 });
    expect(summary.projection.targetCourseCount).toBe(1);
    expect(summary.needed).toMatchObject({ status: "needed", term: "Winter 2026", termCredits: 3 });
  });

  it("falls back to the 4.0 scale without a profile", async () => {
    const { loadGpaSummary } = await import("./gpa");
    const { supabase } = fakeSupabase({ courses: [] });
    const summary = await loadGpaSummary(supabase, "u1");
    expect(summary.scale).toBe("us_4_0");
    expect(summary.terms).toEqual([]);
  });
});
