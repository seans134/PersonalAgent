import Link from "next/link";
import { redirect } from "next/navigation";
import { NaturalLanguageOnboardingPanel } from "@/components/natural-language-onboarding-panel";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";
import { OnboardingScheduleCalendar } from "./schedule/schedule-calendar";

type RhythmBlockRow = {
  id: string;
  title: string;
  category: "school" | "work" | "study" | "personal" | "unavailable";
  days_of_week: number[];
  start_time: string;
  end_time: string;
};

export default async function OnboardingPage({
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

  const { data: rhythmBlocks } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .order("start_time", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          {!onboarded ? (
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 2 of 3</p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {onboarded ? "Weekly rhythm" : "Build your weekly rhythm"}
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Add recurring habits and protected time that should shape your week outside school and work.
          </p>
        </div>
        <Link className="text-sm text-ink-muted underline" href={onboarded ? "/" : "/onboarding/schedule"}>
          {onboarded ? "Back home" : "Back"}
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-danger">{params.error}</p> : null}
      {!onboarded ? <OnboardingProgress currentStep={2} /> : null}

      <NaturalLanguageOnboardingPanel mode="weekly_rhythm" />

      <section className="mb-6">
        <OnboardingScheduleCalendar
          categories={["study", "personal", "unavailable"]}
          defaultCategory="study"
          initialBlocks={(rhythmBlocks ?? []) as RhythmBlockRow[]}
          userId={user.id}
          visibleCategories={["school", "work", "study", "personal", "unavailable"]}
        />
      </section>

      {!onboarded ? (
        <div className="mt-6">
          <Link className="inline-flex rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" href="/goals">
            Continue to goals
          </Link>
        </div>
      ) : null}
    </main>
  );
}
