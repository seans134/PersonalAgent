import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCalendarConnectionStatus } from "@/lib/google/calendar";
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

  const calendarConnection = user
    ? await getCalendarConnectionStatus(supabase, user.id)
    : { connected: false as const, expiresAt: null as string | null };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Atlas</p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">Personal AI life agent</h1>
          <p className="mt-3 max-w-xl text-zinc-700">
            Phase 1 is live: authentication and onboarding for goals, constraints, and preferences.
          </p>
        </div>
        {user ? (
          <form action="/logout" method="post">
            <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" type="submit">
              Sign out
            </button>
          </form>
        ) : null}
      </header>

      {!user ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-zinc-700">Sign in to start onboarding.</p>
          <Link className="inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href="/auth">
            Go to auth
          </Link>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">Signed in as {user.email}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Active goals</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{activeGoalsCount ?? 0}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Completed goals</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{completedGoalsCount ?? 0}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Focus block</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{profile?.focus_block_minutes ?? "-"}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Google Calendar</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">
                  {calendarConnection.connected ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <p className="text-sm text-zinc-700">
              Work hours: {profile?.work_start_time ?? "--:--"} - {profile?.work_end_time ?? "--:--"} | Workout: {profile?.workout_preference ?? "none"}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href="/onboarding">
                Edit onboarding
              </Link>
              <Link className="inline-flex rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900" href="/goals">
                Open goals
              </Link>
              <Link className="inline-flex rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900" href="/goals/completed">
                Completed goals
              </Link>
              <Link className="inline-flex rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900" href="/calendar">
                Open calendar
              </Link>
            </div>
          </section>
          <TodayPlanPanel />
        </div>
      )}
    </main>
  );
}
