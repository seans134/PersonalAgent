import Link from "next/link";
import { redirect } from "next/navigation";
import { analyticsEvents, hasCoursesReady } from "@personal-agent/core";
import { completeOnboarding } from "@/app/onboarding/actions";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { TrackEvents } from "@/components/track-event";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

// Same events and properties as mobile's completeMobileOnboarding.
function completionEvents(progress: { courseCount: number; classTimeCount: number }) {
  const counts = { courses: progress.courseCount, class_times: progress.classTimeCount };
  return [
    { event: analyticsEvents.onboardingCompleted, properties: { ...counts, skipped_setup: !hasCoursesReady(progress) } },
    ...(hasCoursesReady(progress) ? [{ event: analyticsEvents.coursesReady, properties: counts }] : []),
  ];
}

export default async function OnboardingDonePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; completed?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // Step 2's Continue / Skip mark onboarding complete on the way here. A student
  // who opens Done directly (e.g. from the progress bar) finishes with the button below.
  const [onboarded, { count: courseCount }, { count: classTimeCount }] = await Promise.all([
    isOnboardingComplete(supabase, user.id),
    supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("schedule_blocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("category", "school"),
  ]);

  const progress = { courseCount: courseCount ?? 0, classTimeCount: classTimeCount ?? 0 };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 3 of 3</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">You&apos;re set</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Head to Today and tap{" "}
          <span className="font-medium text-ink">Plan my day</span> to get your first study plan.
        </p>
      </div>

      {params.error ? <p className="mb-4 text-sm text-danger">{params.error}</p> : null}
      {params.completed === "1" ? (
        <TrackEvents events={completionEvents(progress)} replaceUrl="/onboarding/done" />
      ) : null}

      <OnboardingProgress
        currentStep="done"
        progress={progress}
      />

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
            <input name="from" type="hidden" value="done" />
            <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
              Finish setup
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
