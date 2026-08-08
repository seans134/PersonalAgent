import { describe, expect, it } from "vitest";
import { formatGrade, gradeZone } from "./grade-format";

describe("grade-format", () => {
  it("formats a grade to one decimal with a percent", () => {
    expect(formatGrade(84)).toBe("84.0%");
  });
  it("shows an em dash for null", () => {
    expect(formatGrade(null)).toBe("—");
  });
  it("maps values to zones", () => {
    expect(gradeZone(50)).toBe("danger");
    expect(gradeZone(72)).toBe("warning");
    expect(gradeZone(91)).toBe("success");
    expect(gradeZone(null)).toBe("empty");
  });
});
