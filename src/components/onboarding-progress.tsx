import Link from "next/link";
import {
  ONBOARDING_STEPS,
  isOnboardingStepComplete,
  onboardingStepNumber,
  type OnboardingProgressInput,
  type OnboardingStepKey,
} from "@personal-agent/core";

const STEP_HREFS: Record<OnboardingStepKey, string> = {
  courses: "/onboarding/courses",
  class_times: "/onboarding/schedule",
  done: "/onboarding/done",
};

export function OnboardingProgress({
  currentStep,
  progress,
}: {
  currentStep: OnboardingStepKey;
  /** Saved course and class-time counts; when given, they decide which steps show a check. */
  progress?: OnboardingProgressInput;
}) {
  const currentNumber = onboardingStepNumber(currentStep);

  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="grid gap-2 sm:grid-cols-3">
        {ONBOARDING_STEPS.map((step) => {
          const isCurrent = step.key === currentStep;
          // With saved data on hand, a skipped step stays unchecked; otherwise fall back to position.
          const isComplete =
            !isCurrent &&
            (progress && step.key !== "done"
              ? isOnboardingStepComplete(step.key, progress)
              : step.number < currentNumber);

          return (
            <li key={step.key}>
              <Link
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                  isCurrent
                    ? "border-teal bg-teal text-on-teal"
                    : isComplete
                      ? "border-line bg-surface text-ink"
                      : "border-line bg-surface text-ink-muted",
                ].join(" ")}
                href={STEP_HREFS[step.key]}
              >
                <span className="flex size-6 items-center justify-center rounded-full border border-current text-xs">
                  {isComplete ? "✓" : step.number}
                </span>
                <span className="font-medium">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
