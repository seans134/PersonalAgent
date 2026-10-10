import { describe, expect, it } from "vitest";
import { computeCourseGrade } from "./compute";
import { computeNeededScore, projectFinalGrade } from "./needed";
import type { GradeCategory, GradedItem } from "./types";

const cats: GradeCategory[] = [
  { id: "hw", name: "Homework", weight: 20 },
  { id: "mid", name: "Midterm", weight: 30 },
  { id: "fin", name: "Final", weight: 50 },
];

// hw: 90/100 graded + 100 ungraded; mid: 80/100 graded; fin: 100 ungraded.
// base = 0.2*45 + 0.3*80 = 33, slope = 0.2*0.5 + 0.5 = 0.6 (60% still to come)
const items: GradedItem[] = [
  { categoryId: "hw", scoreEarned: 90, scoreMax: 100 },
  { categoryId: "hw", scoreEarned: null, scoreMax: 100 },
  { categoryId: "mid", scoreEarned: 80, scoreMax: 100 },
  { categoryId: "fin", scoreEarned: null, scoreMax: 100 },
];

describe("projectFinalGrade", () => {
  it("projects the what-if grade at an assumed percent", () => {
    expect(projectFinalGrade(cats, items, 0)).toBeCloseTo(33, 9);
    expect(projectFinalGrade(cats, items, 100)).toBeCloseTo(93, 9);
    expect(projectFinalGrade(cats, items, 50)).toBeCloseTo(63, 9);
  });

  it("returns null without categories or weight", () => {
    expect(projectFinalGrade([], items, 80)).toBeNull();
    expect(projectFinalGrade([{ id: "hw", name: "Homework", weight: 0 }], items, 80)).toBeNull();
  });
});

describe("computeNeededScore", () => {
  it("solves the needed average directly", () => {
    const result = computeNeededScore(cats, items, 75);
    expect(result.status).toBe("needed");
    if (result.status !== "needed") return;
    expect(result.neededPercent).toBeCloseTo(70, 9);
    expect(result.remainingWeight).toBeCloseTo(60, 9);
  });

  it("reports secured when the target is reached even at zero", () => {
    const result = computeNeededScore(cats, items, 30);
    expect(result.status).toBe("secured");
    if (result.status !== "secured") return;
    expect(result.neededPercent).toBeCloseTo(-5, 9);
  });

  it("reports out of reach with the best possible grade", () => {
    const result = computeNeededScore(cats, items, 95);
    expect(result.status).toBe("out_of_reach");
    if (result.status !== "out_of_reach") return;
    expect(result.neededPercent).toBeCloseTo(103.333, 2);
    expect(result.maxPossible).toBeCloseTo(93, 9);
  });

  it("reports no target for null or non-finite targets", () => {
    expect(computeNeededScore(cats, items, null)).toEqual({ status: "no_target" });
    expect(computeNeededScore(cats, items, Number.NaN)).toEqual({ status: "no_target" });
  });

  it("reports no categories when there is no weight", () => {
    expect(computeNeededScore([], items, 80)).toEqual({ status: "no_categories" });
  });

  it("normalizes weights that do not sum to 100", () => {
    const partial: GradeCategory[] = [
      { id: "a", name: "A", weight: 60 },
      { id: "b", name: "B", weight: 30 },
    ];
    const result = computeNeededScore(
      partial,
      [
        { categoryId: "a", scoreEarned: 80, scoreMax: 100 },
        { categoryId: "b", scoreEarned: null, scoreMax: 50 },
      ],
      70,
    );
    // base = 2/3*80 = 53.33, slope = 1/3 -> (70 - 53.33) * 3 = 50
    expect(result.status).toBe("needed");
    if (result.status !== "needed") return;
    expect(result.neededPercent).toBeCloseTo(50, 9);
    expect(result.remainingWeight).toBeCloseTo(100 / 3, 9);
  });

  it("reports the final grade when nothing is left", () => {
    const done: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 90, scoreMax: 100 },
      { categoryId: "mid", scoreEarned: 80, scoreMax: 100 },
      { categoryId: "fin", scoreEarned: 70, scoreMax: 100 },
    ];
    // 18 + 24 + 35 = 77
    const met = computeNeededScore(cats, done, 77);
    expect(met.status).toBe("nothing_left");
    if (met.status !== "nothing_left") return;
    expect(met.finalGrade).toBeCloseTo(77, 9);
    expect(met.met).toBe(true);
    expect(met.remainingWeight).toBe(0);

    const missed = computeNeededScore(cats, done, 78);
    expect(missed).toMatchObject({ status: "nothing_left", met: false });
  });

  it("treats categories without gradable items as fully remaining and ignores stray items", () => {
    const sparse: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 100, scoreMax: 100 },
      { categoryId: "fin", scoreEarned: null, scoreMax: 0 }, // zero max: ignored
      { categoryId: "fin", scoreEarned: 0, scoreMax: 0 }, // zero max: ignored
      { categoryId: null, scoreEarned: 0, scoreMax: 100 }, // no category: ignored
      { categoryId: "ghost", scoreEarned: 0, scoreMax: 100 }, // unknown category: ignored
    ];
    // mid has no items and fin has none gradable: base = 20, slope = 0.8
    expect(projectFinalGrade(cats, sparse, 0)).toBeCloseTo(20, 9);
    expect(projectFinalGrade(cats, sparse, 100)).toBeCloseTo(100, 9);
    const result = computeNeededScore(cats, sparse, 60);
    expect(result.status).toBe("needed");
    if (result.status !== "needed") return;
    expect(result.neededPercent).toBeCloseTo(50, 9);
    expect(result.remainingWeight).toBeCloseTo(80, 9);
  });

  it("round-trips through projectFinalGrade and is bracketed by 0 and 100", () => {
    const target = 81.5;
    const result = computeNeededScore(cats, items, target);
    expect(result.status).toBe("needed");
    if (result.status !== "needed") return;
    const atZero = projectFinalGrade(cats, items, 0)!;
    const atHundred = projectFinalGrade(cats, items, 100)!;
    expect(atZero).toBeLessThan(target);
    expect(atHundred).toBeGreaterThan(target);
    const projected = projectFinalGrade(cats, items, result.neededPercent)!;
    expect(Math.abs(projected - target)).toBeLessThan(1e-9);
  });

  it("treats a need of exactly 100 as needed despite float noise", () => {
    const tight: GradeCategory[] = [
      { id: "a", name: "A", weight: 10 },
      { id: "b", name: "B", weight: 40 },
      { id: "c", name: "C", weight: 50 },
    ];
    const result = computeNeededScore(
      tight,
      [
        { categoryId: "a", scoreEarned: 70, scoreMax: 100 },
        { categoryId: "b", scoreEarned: 70, scoreMax: 100 },
        { categoryId: "c", scoreEarned: null, scoreMax: 100 },
      ],
      85,
    );
    // Exact need is 100; unrounded math gives 100.00000000000001
    expect(result).toMatchObject({ status: "needed", neededPercent: 100 });
  });

  it("counts a final grade equal to the target as met despite float noise", () => {
    const done: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 57, scoreMax: 100 },
      { categoryId: "mid", scoreEarned: 57, scoreMax: 100 },
      { categoryId: "fin", scoreEarned: 57, scoreMax: 100 },
    ];
    expect(computeNeededScore(cats, done, 57)).toMatchObject({ status: "nothing_left", met: true });
  });

  it("ignores items with a non-finite scoreMax", () => {
    const withInfinity: GradedItem[] = [...items, { categoryId: "fin", scoreEarned: null, scoreMax: Infinity }];
    expect(projectFinalGrade(cats, withInfinity, 50)).toBeCloseTo(63, 9);
  });
});

describe("projectFinalGrade vs computeCourseGrade", () => {
  it("matches the course average when every category is graded and nothing is left", () => {
    const done: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 45, scoreMax: 50 },
      { categoryId: "hw", scoreEarned: 8, scoreMax: 10 },
      { categoryId: "mid", scoreEarned: 71, scoreMax: 90 },
      { categoryId: "fin", scoreEarned: 88, scoreMax: 120 },
    ];
    const average = computeCourseGrade(cats, done).average!;
    expect(projectFinalGrade(cats, done, 0)).toBeCloseTo(average, 9);
    expect(projectFinalGrade(cats, done, 100)).toBeCloseTo(average, 9);
  });
});
