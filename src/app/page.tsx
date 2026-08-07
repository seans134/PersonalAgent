import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TodayPlanPanel } from "@/components/today-plan-panel";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("work_start_time, work_end_time, focus_block_minutes, workout_preference")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const { count: activeGoalsCount } = user
    ? await supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("completed_at", null)
    : { count: 0 };

  const { count: completedGoalsCount } = user
    ? await supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("completed_at", "is", null)
    : { count: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { count: mealsLoggedCount } = user
    ? await supabase
        .from("meal_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("logged_at", todayStart.toISOString())
        .lte("logged_at", todayEnd.toISOString())
    : { count: 0 };

  const { count: workoutsLoggedCount } = user
    ? await supabase
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("logged_at", todayStart.toISOString())
        .lte("logged_at", todayEnd.toISOString())
    : { count: 0 };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <header className="mb-8">
        <p className="flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-teal">
          <span className="inline-block h-px w-6 bg-teal" aria-hidden="true" />
          Atlas
        </p>
        <h1 className="mt-3 text-balance font-display text-4xl font-bold tracking-tight text-ink">Your day, charted.</h1>
        <p className="mt-3 max-w-xl text-ink-muted">
          Goals, calendar, meals, and training — routed into a single plan, with the times kept honest.
        </p>
      </header>

      {!user ? (
        <section className="rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
          <p className="mb-4 text-ink-muted">Sign in to start charting your day.</p>
          <Link
            className="inline-flex rounded-[11px] bg-teal px-5 py-2.5 font-display text-sm font-medium text-on-teal transition hover:bg-teal-strong"
            href="/auth"
          >
            Sign in
          </Link>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="space-y-4 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
            <p className="font-mono text-[12px] text-ink-muted">Signed in as {user.email}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Active goals", value: activeGoalsCount ?? 0 },
                { label: "Completed", value: completedGoalsCount ?? 0 },
                { label: "Meals today", value: mealsLoggedCount ?? 0 },
                { label: "Workouts today", value: workoutsLoggedCount ?? 0 },
              ].map((stat) => (
                <div className="rounded-[12px] border border-line bg-surface2 p-4" key={stat.label}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">{stat.label}</p>
                  <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{stat.value}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-[12px] text-ink-muted">
              Work {profile?.work_start_time ?? "--:--"}–{profile?.work_end_time ?? "--:--"} · Workout: {profile?.workout_preference ?? "none"}
            </p>
          </section>
          <TodayPlanPanel />
        </div>
      )}
    </main>
  );
}
