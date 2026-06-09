import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NaturalLanguageWorkoutLogPanel } from "./natural-language-workout-log-panel";
import { PlannedWorkoutList, type PlannedWorkoutItem } from "./planned-workout-list";
import { WorkoutLogForm } from "./workout-log-form";
import { WorkoutLogList, type WorkoutLogListItem } from "./workout-log-list";

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function appDayOfWeek(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export default async function TrackWorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { start, end } = todayBounds();
  const { data: workoutLogs, error } = await supabase
    .from("workout_logs")
    .select("id, source_schedule_item_id, logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes")
    .eq("user_id", user.id)
    .gte("logged_at", start.toISOString())
    .lte("logged_at", end.toISOString())
    .order("logged_at", { ascending: false });

  const { data: plannedWorkouts, error: plannedError } = await supabase
    .from("workout_schedule_items")
    .select("id, workout_type, tracking_method, title, duration_minutes, metrics, notes")
    .eq("user_id", user.id)
    .eq("day_of_week", appDayOfWeek(start))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const workouts = (workoutLogs ?? []) as WorkoutLogListItem[];
  const planned = (plannedWorkouts ?? []) as PlannedWorkoutItem[];
  const completedScheduleItemIds = workouts.flatMap((workout) =>
    workout.source_schedule_item_id ? [workout.source_schedule_item_id] : [],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Tracking</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Track workouts</h1>
          <p className="mt-2 max-w-2xl text-zinc-700">Log strength, cardio, recovery, and sport sessions.</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Workout plan</h2>
            <p className="mt-1 text-sm text-zinc-600">Build the weekly workout schedule on its own page.</p>
          </div>
          <Link
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
            href="/tracking/workouts/plan"
          >
            Plan workouts
          </Link>
        </div>
      </section>

      <NaturalLanguageWorkoutLogPanel />

      {error ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error.message}
        </p>
      ) : null}
      {plannedError ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {plannedError.message}
        </p>
      ) : null}

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Today&apos;s planned workouts</h2>
        <PlannedWorkoutList completedScheduleItemIds={completedScheduleItemIds} items={planned} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <WorkoutLogForm />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Today&apos;s workouts</h2>
          <WorkoutLogList workouts={workouts} />
        </section>
      </div>
    </main>
  );
}
