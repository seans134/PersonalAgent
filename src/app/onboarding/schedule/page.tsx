import Link from "next/link";
import { redirect } from "next/navigation";
import { NaturalLanguageOnboardingPanel } from "@/components/natural-language-onboarding-panel";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";
import { OnboardingScheduleCalendar } from "./schedule-calendar";

type ScheduleBlockRow = {
  id: string;
  title: string;
  category: "school" | "work";
  days_of_week: number[];
  start_time: string;
  end_time: string;
};

export default async function ScheduleCommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const onboarded = await isOnboardingComplete(supabase, user.id);

  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .in("category", ["school", "work"])
    .order("start_time", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          {!onboarded ? (
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 1 of 3</p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {onboarded ? "School & work" : "Add school and work"}
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Click open times on the weekly calendar to add fixed classes and work shifts Atlas should plan around.
          </p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/">
          Back home
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-danger">{params.error}</p> : null}
      {!onboarded ? <OnboardingProgress currentStep={1} /> : null}

      <NaturalLanguageOnboardingPanel mode="school_work" />

      <OnboardingScheduleCalendar initialBlocks={(blocks ?? []) as ScheduleBlockRow[]} userId={user.id} />

      {!onboarded ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" href="/onboarding">
            Continue
          </Link>
          <Link className="text-sm text-ink-muted underline" href="/onboarding">
            Skip for now
          </Link>
        </div>
      ) : null}
    </main>
  );
}
