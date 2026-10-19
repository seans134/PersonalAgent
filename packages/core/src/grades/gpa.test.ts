import { describe, expect, it } from "vitest";
import {
  buildGpaSummary,
  describeGpaNeeded,
  formatGpa,
  gpaScale,
  gradePoints,
  parseCreditsInput,
  parseFinalGradeInput,
  parseGpaTargetInput,
  percentToLetter,
  termSortKey,
  type GpaCourseInput,
} from "./gpa";

function course(overrides: Partial<GpaCourseInput> & { id: string }): GpaCourseInput {
  return {
    name: overrides.id, code: null, term: "Fall 2026", credits: 3, finalGrade: null, currentPercent: null,
    targetPercent: null, ...overrides,
  };
}

describe("percentToLetter", () => {
  it("uses the standard US cutoffs", () => {
    const cases: Array<[number, string]> = [
      [100, "A+"], [97, "A+"], [96.9, "A"], [93, "A"], [92.99, "A-"], [90, "A-"], [87, "B+"], [83, "B"],
      [80, "B-"], [77, "C+"], [73, "C"], [70, "C-"], [67, "D+"], [63, "D"], [60, "D-"], [59.99, "F"], [0, "F"],
    ];
    for (const [percent, letter] of cases) expect(percentToLetter(percent)).toBe(letter);
  });

  it("ignores float noise just under a cutoff", () => {
    expect(percentToLetter(93 - 1e-12)).toBe("A");
  });
});

describe("scales", () => {
  it("awards A+ 4.0 on the 4.0 scale and 4.3 on the 4.3 scale", () => {
    expect(gradePoints("A+", gpaScale("us_4_0"))).toBe(4);
    expect(gradePoints("A+", gpaScale("us_4_3"))).toBe(4.3);
    expect(gradePoints("B-", gpaScale("us_4_3"))).toBe(2.7);
    expect(gradePoints("F", gpaScale("us_4_0"))).toBe(0);
  });

  it("falls back to the 4.0 scale for unknown ids", () => {
    expect(gpaScale("nope").id).toBe("us_4_0");
    expect(gpaScale(undefined).id).toBe("us_4_0");
  });
});

describe("input parsing", () => {
  it("parses credits", () => {
    expect(parseCreditsInput("")).toBeNull();
    expect(parseCreditsInput(null)).toBeNull();
    expect(parseCreditsInput("3.5")).toBe(3.5);
    expect(parseCreditsInput(0)).toBe(0);
    expect(() => parseCreditsInput(21)).toThrow(/between 0 and 20/);
    expect(() => parseCreditsInput("three")).toThrow(/Credits/);
  });

  it("parses final letter grades case-insensitively", () => {
    expect(parseFinalGradeInput(" a- ")).toBe("A-");
    expect(parseFinalGradeInput("")).toBeNull();
    expect(parseFinalGradeInput(null)).toBeNull();
    expect(() => parseFinalGradeInput("E")).toThrow(/letter grade/);
    expect(() => parseFinalGradeInput(90)).toThrow(/letter grade/);
  });

  it("parses a cumulative target within the scale", () => {
    expect(parseGpaTargetInput("3.7", 4)).toBe(3.7);
    expect(parseGpaTargetInput("4.2", 4)).toBeNull();
    expect(parseGpaTargetInput("4.2", 4.3)).toBe(4.2);
    expect(parseGpaTargetInput("0", 4)).toBeNull();
    expect(parseGpaTargetInput("", 4)).toBeNull();
  });

  it("formats GPA to two decimals", () => {
    expect(formatGpa(3.6666)).toBe("3.67");
    expect(formatGpa(null)).toBe("—");
  });
});

describe("termSortKey", () => {
  it("orders seasons within a year", () => {
    expect(termSortKey("Winter 2027")).toEqual([2027, 0]);
    expect(termSortKey("2026 Fall")).toEqual([2026, 3]);
    expect(termSortKey("Spring '27")).toEqual([2027, 1]);
    expect(termSortKey("Term A")).toBeNull();
  });
});

describe("buildGpaSummary", () => {
  it("weights by credits and splits final from in-progress grades", () => {
    const summary = buildGpaSummary({
      scaleId: "us_4_0",
      courses: [
        course({ id: "bio", term: "Fall 2025", credits: 4, finalGrade: "A" }),
        course({ id: "eng", term: "Fall 2025", credits: 3, finalGrade: "B+" }),
        course({ id: "chem", term: "Winter 2026", credits: 4, currentPercent: 88.4 }),
      ],
    });
    expect(summary.terms.map((t) => t.term)).toEqual(["Fall 2025", "Winter 2026"]);
    const [fall, winter] = summary.terms;
    expect(fall.gpa).toBeCloseTo((4 * 4 + 3 * 3.3) / 7, 9);
    expect(fall.isFinal).toBe(true);
    expect(winter.isFinal).toBe(false);
    expect(winter.courses[0]).toMatchObject({ status: "in_progress", letter: "B+", points: 3.3, percent: 88.4 });
    expect(summary.cumulative.gpa).toBeCloseTo((16 + 9.9 + 4 * 3.3) / 11, 9);
    expect(summary.cumulative.finalGpa).toBeCloseTo((16 + 9.9) / 7, 9);
    expect(summary.cumulative).toMatchObject({ credits: 11, finalCredits: 7, inProgressCredits: 4 });
    expect(summary.courseCount).toBe(3);
  });

  it("prefers the final grade over the computed one", () => {
    const summary = buildGpaSummary({
      scaleId: "us_4_0",
      courses: [course({ id: "c", finalGrade: "C", currentPercent: 95 })],
    });
    expect(summary.terms[0].courses[0]).toMatchObject({ status: "final", letter: "C", points: 2, percent: null });
  });

  it("uses the selected scale", () => {
    const courses = [course({ id: "a", credits: 3, finalGrade: "A+" }), course({ id: "b", credits: 3, finalGrade: "B" })];
    expect(buildGpaSummary({ scaleId: "us_4_0", courses }).cumulative.gpa).toBeCloseTo(3.5, 9);
    const scaled = buildGpaSummary({ scaleId: "us_4_3", courses });
    expect(scaled.cumulative.gpa).toBeCloseTo(3.65, 9);
    expect(scaled).toMatchObject({ scale: "us_4_3", scaleMax: 4.3 });
  });

  it("reports courses with no credits or no grade", () => {
    const summary = buildGpaSummary({
      scaleId: "us_4_0",
      courses: [
        course({ id: "lab", code: "BIO 101L", credits: null, currentPercent: 90 }),
        course({ id: "zero", credits: 0, finalGrade: "A" }),
        course({ id: "new", credits: 3 }),
        course({ id: "ok", credits: 3, currentPercent: 80 }),
      ],
    });
    expect(summary.excluded).toEqual([
      { id: "lab", label: "BIO 101L", term: "Fall 2026", reason: "no_credits" },
      { id: "zero", label: "zero", term: "Fall 2026", reason: "no_credits" },
      { id: "new", label: "new", term: "Fall 2026", reason: "no_grade" },
    ]);
    expect(summary.cumulative.gpa).toBeCloseTo(2.7, 9);
    expect(summary.courseCount).toBe(1);
  });

  it("groups terms case-insensitively and puts unrecognised then no-term groups last", () => {
    const summary = buildGpaSummary({
      scaleId: "us_4_0",
      courses: [
        course({ id: "a", term: null, finalGrade: "A" }),
        course({ id: "b", term: "Term A", finalGrade: "A" }),
        course({ id: "c", term: "fall 2026", finalGrade: "A" }),
        course({ id: "d", term: "Fall  2026", finalGrade: "B" }),
        course({ id: "e", term: "Spring 2026", finalGrade: "B" }),
      ],
    });
    expect(summary.terms.map((t) => t.term)).toEqual(["Spring 2026", "fall 2026", "Term A", null]);
    expect(summary.terms[1].courses).toHaveLength(2);
  });

  it("returns empty results with no courses", () => {
    const summary = buildGpaSummary({ scaleId: "us_4_0", courses: [] });
    expect(summary.terms).toEqual([]);
    expect(summary.cumulative.gpa).toBeNull();
    expect(summary.projection.gpa).toBeNull();
    expect(summary.needed).toEqual({ status: "no_target" });
  });

  it("projects GPA with target grades for unfinished courses", () => {
    const summary = buildGpaSummary({
      scaleId: "us_4_0",
      courses: [
        course({ id: "done", term: "Fall 2025", credits: 3, finalGrade: "B" }),
        course({ id: "chem", credits: 4, currentPercent: 81, targetPercent: 90 }),
        // No target: projected at its current grade.
        course({ id: "eng", credits: 3, currentPercent: 88 }),
        // No grade yet, but a target: counts in the projection only.
        course({ id: "stats", credits: 3, targetPercent: 93 }),
      ],
    });
    expect(summary.projection.targetCourseCount).toBe(2);
    expect(summary.projection.credits).toBe(13);
    expect(summary.projection.gpa).toBeCloseTo((3 * 3 + 4 * 3.7 + 3 * 3.3 + 3 * 4) / 13, 9);
    expect(summary.terms[1].projectedGpa).toBeCloseTo((4 * 3.7 + 3 * 3.3 + 3 * 4) / 10, 9);
    expect(summary.cumulative.gpa).toBeCloseTo((9 + 4 * 2.7 + 3 * 3.3) / 10, 9);
  });

  describe("needed term GPA", () => {
    const history = [
      course({ id: "f1", term: "Fall 2025", credits: 15, finalGrade: "B" }), // 45 points
      course({ id: "w1", term: "Winter 2026", credits: 4, currentPercent: 85 }),
      course({ id: "w2", term: "Winter 2026", credits: 4 }),
      course({ id: "w3", term: "Winter 2026", credits: 4, finalGrade: "A" }),
    ];

    it("solves for the open term's unfinished credits", () => {
      const summary = buildGpaSummary({ scaleId: "us_4_0", courses: history, targetGpa: 3.4 });
      // Prior: 15 cr at 3.0 + 4 cr at 4.0 = 61 points / 19 cr. Open: 8 cr. Total 27.
      expect(summary.needed).toMatchObject({ status: "needed", term: "Winter 2026", termCredits: 8 });
      if (summary.needed.status !== "needed") throw new Error("expected needed");
      expect(summary.needed.neededGpa).toBeCloseTo((3.4 * 27 - 61) / 8, 9);
      expect(summary.needed.maxPossible).toBeCloseTo((61 + 32) / 27, 9);
      expect(describeGpaNeeded(summary.needed)).toBe(
        "You need a 3.85 term GPA in Winter 2026 (8 credits) to reach 3.40.",
      );
    });

    it("reports out of reach and secured targets", () => {
      const high = buildGpaSummary({ scaleId: "us_4_0", courses: history, targetGpa: 3.9 });
      expect(high.needed.status).toBe("out_of_reach");
      expect(describeGpaNeeded(high.needed)).toMatch(/best cumulative GPA you can reach is 3\.44/);
      const low = buildGpaSummary({ scaleId: "us_4_0", courses: history, targetGpa: 2 });
      expect(low.needed.status).toBe("secured");
    });

    it("allows a higher need on the 4.3 scale", () => {
      // Needs 4.19: past the top of the 4.0 scale, but reachable with A+ grades at 4.3.
      expect(buildGpaSummary({ scaleId: "us_4_0", courses: history, targetGpa: 3.5 }).needed.status).toBe("out_of_reach");
      expect(buildGpaSummary({ scaleId: "us_4_3", courses: history, targetGpa: 3.5 }).needed.status).toBe("needed");
    });

    it("uses the requested term when it has unfinished courses", () => {
      const courses = [...history, course({ id: "s1", term: "Spring 2026", credits: 3, currentPercent: 90 })];
      expect(buildGpaSummary({ scaleId: "us_4_0", courses, targetGpa: 3.4 }).needed).toMatchObject({ term: "Spring 2026" });
      const picked = buildGpaSummary({ scaleId: "us_4_0", courses, targetGpa: 3.4, requestedTerm: "winter 2026" });
      expect(picked.needed).toMatchObject({ term: "Winter 2026", termCredits: 8 });
      // Spring's in-progress grade now counts as it stands.
      if (picked.needed.status === "no_target" || picked.needed.status === "no_open_term") throw new Error("expected a need");
      expect(picked.needed.neededGpa).toBeCloseTo((3.4 * 30 - (61 + 3 * 3.7)) / 8, 9);
    });

    it("has no open term when every credited course is final", () => {
      const summary = buildGpaSummary({
        scaleId: "us_4_0", courses: [course({ id: "x", finalGrade: "A" })], targetGpa: 3.5,
      });
      expect(summary.needed).toEqual({ status: "no_open_term" });
      expect(describeGpaNeeded(summary.needed)).toMatch(/final grade/);
    });
  });
});
