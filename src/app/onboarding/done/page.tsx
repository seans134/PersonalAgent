import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboarding } from "@/app/onboarding/actions";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingDonePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // Step 2's Continue / Skip mark onboarding complete on the way here. A student
  // who opens Done directly (e.g. from the progress bar) finishes with the button below.
  const onboarded = await isOnboardingComplete(supabase, user.id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 3 of 3</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">You&apos;re set</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Head to Today and tap{" "}
          <span className="font-medium text-ink">Generate today</span> to chart your first study plan.
        </p>
      </div>

      <OnboardingProgress currentStep="done" />

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-sm text-ink-muted">
          You can add more courses, change class times, or set optional goals and a weekly rhythm any time from the
          menu.
        </p>
        {onboarded ? (
          <Link className="mt-4 inline-flex rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" href="/">
            Go to Today
          </Link>
        ) : (
          <form action={completeOnboarding} className="mt-4">
            <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
              Finish setup
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
