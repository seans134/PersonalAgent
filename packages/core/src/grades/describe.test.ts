import { describe, expect, it } from "vitest";
import { describeNeeded, formatGradePercent, parsePercentInput } from "./describe";

describe("formatGradePercent", () => {
  it("rounds to one decimal and never goes negative", () => {
    expect(formatGradePercent(84.99999)).toBe("85.0%");
    expect(formatGradePercent(72)).toBe("72.0%");
    expect(formatGradePercent(-0.00001)).toBe("0.0%");
    expect(formatGradePercent(-12)).toBe("0.0%");
    expect(formatGradePercent(Number.NaN)).toBe("—");
  });
});

describe("describeNeeded", () => {
  it("describes the needed average and remaining weight", () => {
    expect(describeNeeded({ status: "needed", neededPercent: 71.99999999, remainingWeight: 40 })).toEqual({
      short: "Need 72.0% on the rest",
      long: "You need an average of 72.0% on the remaining work (40.0% of your grade still to come).",
    });
  });

  it("describes a secured target", () => {
    expect(describeNeeded({ status: "secured", neededPercent: -20, remainingWeight: 10 })).toEqual({
      short: "Target secured",
      long: "Target secured, even with 0% on what's left.",
    });
  });

  it("describes an out-of-reach target with the best possible finish", () => {
    expect(
      describeNeeded({ status: "out_of_reach", neededPercent: 120, maxPossible: 88.04999, remainingWeight: 30 }),
    ).toEqual({ short: "Out of reach", long: "Out of reach: the best you can finish with is 88.0%." });
  });

  it("describes a finished course as met or missed", () => {
    expect(describeNeeded({ status: "nothing_left", finalGrade: 91.25, met: true, remainingWeight: 0 })).toEqual({
      short: "Target met",
      long: "Final grade 91.3%: target met.",
    });
    expect(describeNeeded({ status: "nothing_left", finalGrade: 70, met: false, remainingWeight: 0 })?.long).toBe(
      "Final grade 70.0%: target missed.",
    );
  });

  it("says nothing without a target or categories", () => {
    expect(describeNeeded({ status: "no_target" })).toBeNull();
    expect(describeNeeded({ status: "no_categories" })).toBeNull();
  });
});

describe("parsePercentInput", () => {
  it("accepts 0-100 with an optional percent sign", () => {
    expect(parsePercentInput("80")).toBe(80);
    expect(parsePercentInput(" 72.5% ")).toBe(72.5);
    expect(parsePercentInput("0")).toBe(0);
    expect(parsePercentInput("100")).toBe(100);
  });

  it("rejects blanks, junk and out-of-range values", () => {
    expect(parsePercentInput("")).toBeNull();
    expect(parsePercentInput("abc")).toBeNull();
    expect(parsePercentInput("-5")).toBeNull();
    expect(parsePercentInput("120")).toBeNull();
  });
});
