import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NaturalLanguageWorkoutPlanPanel } from "./natural-language-workout-plan-panel";
import { WorkoutSchedulePanel, type WorkoutScheduleItem } from "../workout-schedule-panel";

export default async function PlanWorkoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: scheduleItems, error } = await supabase
    .from("workout_schedule_items")
    .select("id, day_of_week, position, workout_type, tracking_method, title, duration_minutes, metrics, notes")
    .eq("user_id", user.id)
    .order("day_of_week", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const schedule = (scheduleItems ?? []) as WorkoutScheduleItem[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Tracking</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Plan workouts</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">Create a weekly workout schedule by day.</p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/tracking/workouts">
          Back to workouts
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-danger bg-surface px-4 py-3 text-sm text-danger">
          Error: {error.message}
        </p>
      ) : null}

      <NaturalLanguageWorkoutPlanPanel />

      <WorkoutSchedulePanel items={schedule} />
    </main>
  );
}
