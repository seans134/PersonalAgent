import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  countClassTimeBlocks,
  isOnboardingStepComplete,
  nextOnboardingStep,
  onboardingStepNumber,
} from "./index";

describe("onboarding steps", () => {
  it("orders courses, class times, then done", () => {
    expect(ONBOARDING_STEPS.map((step) => step.key)).toEqual(["courses", "class_times", "done"]);
    expect(ONBOARDING_STEPS.map((step) => step.label)).toEqual(["Add your courses", "Class times", "Done"]);
    expect(onboardingStepNumber("courses")).toBe(1);
    expect(onboardingStepNumber("class_times")).toBe(2);
    expect(onboardingStepNumber("done")).toBe(3);
  });

  it("starts at courses when nothing is set up", () => {
    expect(nextOnboardingStep({ courseCount: 0, classTimeCount: 0 })).toBe("courses");
  });

  it("asks for courses first even when class times exist", () => {
    expect(nextOnboardingStep({ courseCount: 0, classTimeCount: 3 })).toBe("courses");
  });

  it("moves to class times once a course exists", () => {
    expect(nextOnboardingStep({ courseCount: 2, classTimeCount: 0 })).toBe("class_times");
  });

  it("is done once a course exists and class times are saved", () => {
    expect(nextOnboardingStep({ courseCount: 1, classTimeCount: 1 })).toBe("done");
    expect(isOnboardingStepComplete("done", { courseCount: 1, classTimeCount: 1 })).toBe(true);
    expect(isOnboardingStepComplete("done", { courseCount: 1, classTimeCount: 0 })).toBe(false);
  });

  it("reports each step's completion independently", () => {
    const progress = { courseCount: 0, classTimeCount: 2 };
    expect(isOnboardingStepComplete("courses", progress)).toBe(false);
    expect(isOnboardingStepComplete("class_times", progress)).toBe(true);
  });

  it("counts only school blocks as class times", () => {
    expect(
      countClassTimeBlocks([{ category: "school" }, { category: "work" }, { category: "study" }, { category: "school" }]),
    ).toBe(2);
    expect(countClassTimeBlocks([])).toBe(0);
  });
});
