import { describe, expect, it } from "vitest";
import { parseSyllabus, validateSyllabusDraft } from "./syllabus-parse";

describe("validateSyllabusDraft", () => {
  it("keeps a well-formed draft and maps category positions by order", () => {
    const draft = validateSyllabusDraft({
      course: { code: "CHEM 201", name: "Organic Chemistry", term: "Fall 2026", target_grade: 85 },
      categories: [
        { name: "Assignments", weight: 20 },
        { name: "Midterm", weight: 30 },
        { name: "Final", weight: 50 },
      ],
      items: [],
      warnings: [],
    });

    expect(draft.course).toEqual({
      code: "CHEM 201",
      name: "Organic Chemistry",
      term: "Fall 2026",
      target_grade: 85,
    });
    expect(draft.categories.map((c) => c.position)).toEqual([0, 1, 2]);
    expect(draft.warnings).toHaveLength(0);
  });

  it("warns when category weights do not sum to 100", () => {
    const draft = validateSyllabusDraft({
      course: { name: "Stats" },
      categories: [
        { name: "Homework", weight: 20 },
        { name: "Exam", weight: 50 },
      ],
      items: [],
    });

    expect(draft.warnings.some((w) => w.includes("70%"))).toBe(true);
  });

  it("normalizes item kinds via synonyms", () => {
    const draft = validateSyllabusDraft({
      course: { name: "Bio" },
      categories: [],
      items: [
        { kind: "Midterm", title: "Midterm 1", due_at: "2026-10-14T23:59:00-04:00" },
        { kind: "Homework", title: "Lab report", due_at: "2026-10-01T23:59:00-04:00" },
        { kind: "Pop quiz", title: "Quiz 3", due_at: "2026-10-05T23:59:00-04:00" },
        { kind: "final exam", title: "Final", due_at: "2026-12-10T23:59:00-04:00" },
      ],
    });

    expect(draft.items.map((i) => i.kind)).toEqual(["exam", "assignment", "quiz", "exam"]);
  });

  it("excludes items without a valid due date and warns", () => {
    const draft = validateSyllabusDraft({
      course: { name: "Physics" },
      categories: [],
      items: [
        { kind: "assignment", title: "Has date", due_at: "2026-10-14T23:59:00-04:00" },
        { kind: "assignment", title: "No date", due_at: null },
        { kind: "assignment", title: "Bad date", due_at: "TBD" },
      ],
    });

    expect(draft.items.map((i) => i.include)).toEqual([true, false, false]);
    expect(draft.warnings.some((w) => w.includes("2 items"))).toBe(true);
  });

  it("defaults a missing course name and warns", () => {
    const draft = validateSyllabusDraft({
      course: { code: "MATH 100" },
      categories: [],
      items: [],
    });

    expect(draft.course.name).toBe("MATH 100");
    expect(draft.warnings.some((w) => w.toLowerCase().includes("name"))).toBe(true);
  });

  it("clamps target grade and default score max", () => {
    const draft = validateSyllabusDraft({
      course: { name: "History", target_grade: 140 },
      categories: [],
      items: [{ kind: "exam", title: "Final", due_at: "2026-12-10T23:59:00-04:00", score_max: -5 }],
    });

    expect(draft.course.target_grade).toBe(100);
    expect(draft.items[0].score_max).toBe(100);
  });
});

describe("parseSyllabus", () => {
  it("runs the injected generator and validates its output", async () => {
    const draft = await parseSyllabus({
      parts: [{ text: "Syllabus text: ..." }],
      generateOutput: async () => ({
        course: { code: "CS 101", name: "Intro to CS", term: "Winter 2026", target_grade: 90 },
        categories: [
          { name: "Labs", weight: 40 },
          { name: "Final", weight: 60 },
        ],
        items: [{ kind: "project", title: "Final project", categoryName: "Labs", due_at: "2026-03-01T23:59:00-05:00" }],
        warnings: [],
      }),
    });

    expect(draft.course.name).toBe("Intro to CS");
    expect(draft.categories).toHaveLength(2);
    expect(draft.items[0].kind).toBe("assignment");
    expect(draft.items[0].categoryName).toBe("Labs");
    expect(draft.items[0].include).toBe(true);
  });

  it("throws when there are no parts to send", async () => {
    await expect(parseSyllabus({ parts: [] })).rejects.toThrow(/syllabus/i);
  });
});
