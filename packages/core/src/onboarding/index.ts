/**
 * Syllabus-first onboarding: add courses, enter class times, done. Goals and
 * the weekly rhythm are optional and live outside this flow.
 */
export type OnboardingStepKey = "courses" | "class_times" | "done";

export type OnboardingStep = {
  key: OnboardingStepKey;
  number: 1 | 2 | 3;
  label: string;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { key: "courses", number: 1, label: "Add your courses" },
  { key: "class_times", number: 2, label: "Class times" },
  { key: "done", number: 3, label: "Done" },
];

export type OnboardingProgressInput = {
  courseCount: number;
  classTimeCount: number;
};

/** Class times are the recurring "school" schedule blocks; work shifts don't count. */
export function countClassTimeBlocks(blocks: ReadonlyArray<{ category: string }>): number {
  return blocks.filter((block) => block.category === "school").length;
}

export function isOnboardingStepComplete(step: OnboardingStepKey, progress: OnboardingProgressInput): boolean {
  const hasCourses = progress.courseCount > 0;
  const hasClassTimes = progress.classTimeCount > 0;

  if (step === "courses") return hasCourses;
  if (step === "class_times") return hasClassTimes;
  return hasCourses && hasClassTimes;
}

/** The first step still missing its data, so a returning student resumes where they left off. */
export function nextOnboardingStep(progress: OnboardingProgressInput): OnboardingStepKey {
  if (!isOnboardingStepComplete("courses", progress)) return "courses";
  if (!isOnboardingStepComplete("class_times", progress)) return "class_times";
  return "done";
}

export function onboardingStepNumber(step: OnboardingStepKey): 1 | 2 | 3 {
  return ONBOARDING_STEPS.find((candidate) => candidate.key === step)?.number ?? 1;
}
