import { describe, expect, it } from "vitest";
import { computeCourseGrade } from "./compute";
import type { GradeCategory, GradedItem } from "./types";

const cats: GradeCategory[] = [
  { id: "hw", name: "Homework", weight: 20 },
  { id: "mid", name: "Midterm", weight: 30 },
  { id: "fin", name: "Final", weight: 50 },
];

describe("computeCourseGrade", () => {
  it("returns null average when nothing is graded", () => {
    const items: GradedItem[] = [{ categoryId: "hw", scoreEarned: null, scoreMax: 100 }];
    const result = computeCourseGrade(cats, items);
    expect(result.average).toBeNull();
    expect(result.gradedWeight).toBe(0);
  });

  it("points-sums within a category", () => {
    const items: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 5, scoreMax: 5 },
      { categoryId: "hw", scoreEarned: 50, scoreMax: 100 },
    ];
    const result = computeCourseGrade(cats, items);
    // (5+50)/(5+100) = 52.38...; only hw graded so average == hw score
    expect(result.average).toBeCloseTo(52.381, 2);
    expect(result.gradedWeight).toBe(20);
    expect(result.categories.find((c) => c.id === "hw")?.gradedCount).toBe(2);
  });

  it("re-normalizes over graded categories only", () => {
    const items: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 90, scoreMax: 100 }, // 90%, weight 20
      { categoryId: "mid", scoreEarned: 80, scoreMax: 100 }, // 80%, weight 30
    ];
    const result = computeCourseGrade(cats, items);
    // (90*20 + 80*30) / (20+30) = (1800+2400)/50 = 84
    expect(result.average).toBeCloseTo(84, 5);
    expect(result.gradedWeight).toBe(50);
  });

  it("ignores items with null category (e.g. ungraded exam without a bucket)", () => {
    const items: GradedItem[] = [
      { categoryId: null, scoreEarned: 100, scoreMax: 100 },
      { categoryId: "hw", scoreEarned: 70, scoreMax: 100 },
    ];
    const result = computeCourseGrade(cats, items);
    expect(result.average).toBeCloseTo(70, 5);
  });

  it("flags weights not summing to 100", () => {
    const result = computeCourseGrade(
      [{ id: "a", name: "A", weight: 40 }, { id: "b", name: "B", weight: 40 }],
      [{ categoryId: "a", scoreEarned: 50, scoreMax: 100 }],
    );
    expect(result.warnings).toContain("weights_sum_not_100");
  });

  it("does not flag when weights sum to 100 within tolerance", () => {
    const result = computeCourseGrade(cats, [{ categoryId: "hw", scoreEarned: 50, scoreMax: 100 }]);
    expect(result.warnings).not.toContain("weights_sum_not_100");
  });
});
