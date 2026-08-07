import Link from "next/link";

type OnboardingStep = {
  href: string;
  label: string;
};

const STEPS: OnboardingStep[] = [
  { href: "/onboarding/schedule", label: "School & work" },
  { href: "/onboarding", label: "Weekly rhythm" },
  { href: "/goals", label: "Goals" },
];

export function OnboardingProgress({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const stepNumber = (index + 1) as 1 | 2 | 3;
          const isCurrent = stepNumber === currentStep;
          const isComplete = stepNumber < currentStep;

          return (
            <li key={step.href}>
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
                href={step.href}
              >
                <span className="flex size-6 items-center justify-center rounded-full border border-current text-xs">
                  {stepNumber}
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
