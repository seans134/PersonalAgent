import Link from "next/link";
import { redirect } from "next/navigation";
import { NaturalLanguageOnboardingPanel } from "@/components/natural-language-onboarding-panel";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { completeOnboarding } from "@/app/onboarding/actions";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";
import { createGoal, saveFitnessOnboarding } from "./actions";
import { GoalsList } from "./goals-list";

function formatMetric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(Number(value));
}

export default async function GoalsPage({
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

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, priority, task_type, minimum_daily_minutes, end_date, completed_at")
    .eq("user_id", user.id)
    .is("completed_at", null)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: bodyProfile } = await supabase
    .from("body_profile_logs")
    .select("height_cm, weight_kg")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          {!onboarded ? (
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 3 of 3</p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Goals</h1>
          <p className="mt-2 text-ink-muted">Add the outcomes Atlas should use to shape your daily plan.</p>
        </div>
        <Link className="text-sm text-ink-muted underline" href={onboarded ? "/" : "/onboarding"}>
          {onboarded ? "Back home" : "Back"}
        </Link>
      </div>

      {!onboarded ? <OnboardingProgress currentStep={3} /> : null}

      <NaturalLanguageOnboardingPanel mode="goals" />

      <form action={saveFitnessOnboarding} className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink">Fitness profile</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Add starting metrics and a fitness outcome for future meal and workout suggestions.
          </p>
        </div>
        {params.error ? <p className="text-sm text-danger">{params.error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="height_cm">
              Height cm
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              defaultValue={formatMetric(bodyProfile?.height_cm)}
              id="height_cm"
              min={1}
              name="height_cm"
              placeholder="178"
              step="0.1"
              type="number"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="weight_kg">
              Weight kg
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              defaultValue={formatMetric(bodyProfile?.weight_kg)}
              id="weight_kg"
              min={1}
              name="weight_kg"
              placeholder="75"
              step="0.1"
              type="number"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="fitness_minimum_daily_minutes">
              Training minutes
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={30}
              id="fitness_minimum_daily_minutes"
              max={720}
              min={0}
              name="minimum_daily_minutes"
              type="number"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="fitness_goal">
            Fitness goal
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="fitness_goal"
            name="fitness_goal"
            placeholder="Ex: Build muscle while keeping energy steady"
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="fitness_goal_details">
            Goal details
          </label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="fitness_goal_details"
            name="fitness_goal_details"
            placeholder="Optional notes about training style, food preferences, or what progress should feel like"
          />
        </div>
        <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
          Save fitness profile
        </button>
      </form>

      <form action={createGoal} className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink">Add goal</h2>
          <p className="mt-1 text-sm text-ink-muted">Create a goal with a clear title and target end date.</p>
        </div>
        {params.error ? <p className="text-sm text-danger">{params.error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="title">
              Goal title
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              id="title"
              name="title"
              placeholder="Ex: Run a half marathon"
              required
              type="text"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="end_date">
              End date
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              id="end_date"
              name="end_date"
              type="date"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="task_type">
              Task type
            </label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue="general"
              id="task_type"
              name="task_type"
            >
              <option value="general">General</option>
              <option value="focus">Focus</option>
              <option value="fitness">Fitness</option>
              <option value="wellness">Wellness</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="minimum_daily_minutes">
              Minimum daily minutes
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={0}
              id="minimum_daily_minutes"
              max={720}
              min={0}
              name="minimum_daily_minutes"
              type="number"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="description">
            Description
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="description"
            name="description"
            placeholder="Optional notes about why this goal matters or what success looks like"
          />
        </div>
        <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
          Add goal
        </button>
      </form>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <GoalsList goals={goals ?? []} />
      </section>

      {!onboarded ? (
        <form action={completeOnboarding} className="mt-6 flex flex-wrap items-center gap-3">
          <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
            Finish onboarding
          </button>
          <button className="text-sm text-ink-muted underline" type="submit">
            Skip for now
          </button>
        </form>
      ) : null}
    </main>
  );
}
