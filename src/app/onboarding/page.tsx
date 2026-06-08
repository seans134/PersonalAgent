import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingProgress } from "@/components/onboarding-progress";
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

  const { data: rhythmBlocks } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .order("start_time", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Step 2 of 3</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Build your weekly rhythm</h1>
          <p className="mt-2 max-w-2xl text-zinc-700">
            Add recurring habits and protected time that should shape your week outside school and work.
          </p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/onboarding/schedule">
          Back
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-red-600">{params.error}</p> : null}
      <OnboardingProgress currentStep={2} />

      <section className="mb-6">
        <OnboardingScheduleCalendar
          categories={["study", "personal", "unavailable"]}
          defaultCategory="study"
          initialBlocks={(rhythmBlocks ?? []) as RhythmBlockRow[]}
          userId={user.id}
          visibleCategories={["school", "work", "study", "personal", "unavailable"]}
        />
      </section>

      <div className="mt-6">
        <Link className="inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href="/goals">
          Continue to goals
        </Link>
      </div>
    </main>
  );
}
