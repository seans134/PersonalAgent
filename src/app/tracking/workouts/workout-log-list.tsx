"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeWorkoutLog } from "../actions";
import type { TrackingActionResult, WorkoutMetrics } from "@/lib/tracking";

export type WorkoutLogListItem = {
  id: string;
  logged_at: string;
  workout_type: string;
  tracking_method: string;
  title: string;
  duration_minutes: number | null;
  intensity: string;
  calories_burned: number | null;
  metrics: WorkoutMetrics;
  notes: string | null;
  source_schedule_item_id: string | null;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatMetricValue(value: string | number | null) {
  return value === null || value === "" ? null : String(value);
}

export function WorkoutLogList({ workouts }: { workouts: WorkoutLogListItem[] }) {
  const router = useRouter();
  const [resultByWorkoutId, setResultByWorkoutId] = useState<Record<string, TrackingActionResult>>({});
  const [pendingWorkoutId, setPendingWorkoutId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove(workoutId: string) {
    const formData = new FormData();
    formData.set("id", workoutId);

    setPendingWorkoutId(workoutId);
    startTransition(async () => {
      const result = await removeWorkoutLog(formData);
      setResultByWorkoutId((current) => ({ ...current, [workoutId]: result }));
      setPendingWorkoutId(null);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  if (workouts.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">No workouts logged today.</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {workouts.map((workout) => {
        const result = resultByWorkoutId[workout.id];
        const isWorkoutPending = isPending && pendingWorkoutId === workout.id;
        const metrics = Object.entries(workout.metrics ?? {}).flatMap(([key, value]) => {
          const formatted = formatMetricValue(value);
          return formatted ? [`${label(key)}: ${formatted}`] : [];
        });

        return (
          <li className="rounded-lg border border-line p-4" key={workout.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{workout.title}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {formatTime(workout.logged_at)} - {label(workout.workout_type)} - {label(workout.tracking_method)}
                </p>
              </div>
              <button
                className="rounded-lg border border-danger bg-danger px-3 py-1.5 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isWorkoutPending}
                onClick={() => handleRemove(workout.id)}
                type="button"
              >
                {isWorkoutPending ? "Removing..." : "Remove"}
              </button>
            </div>

            <p className="mt-2 text-sm text-ink-muted">
              {workout.duration_minutes ? `${workout.duration_minutes} min - ` : ""}
              {workout.intensity}
              {workout.calories_burned !== null ? ` - ${workout.calories_burned} cal` : ""}
            </p>
            {metrics.length > 0 ? <p className="mt-2 text-sm text-ink-muted">{metrics.join(" - ")}</p> : null}
            {workout.notes ? <p className="mt-2 text-sm text-ink-muted">{workout.notes}</p> : null}
            {result?.error ? <p className="mt-2 text-sm text-danger">{result.error}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
