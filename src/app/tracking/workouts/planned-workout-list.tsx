"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkoutLogFromScheduleItem, createWorkoutLogsFromTodaySchedule } from "../actions";
import type { TrackingActionResult, WorkoutMetrics } from "@/lib/tracking";

export type PlannedWorkoutItem = {
  id: string;
  workout_type: string;
  tracking_method: string;
  title: string;
  duration_minutes: number | null;
  metrics: WorkoutMetrics;
  notes: string | null;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function plannedDetail(item: PlannedWorkoutItem) {
  if (item.tracking_method === "sets_reps_weight") {
    const sets = item.metrics?.sets;
    const reps = item.metrics?.reps;
    const weight = item.metrics?.weight;
    const unit = item.metrics?.weight_unit ?? "lb";
    const parts = [
      sets ? `${sets} sets` : null,
      reps ? `${reps} reps` : null,
      weight !== null && weight !== undefined ? `${weight} ${unit}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(" - ") : null;
  }

  return item.duration_minutes ? `${item.duration_minutes} min` : null;
}

export function PlannedWorkoutList({
  completedScheduleItemIds,
  items,
}: {
  completedScheduleItemIds: string[];
  items: PlannedWorkoutItem[];
}) {
  const router = useRouter();
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [isTrackingAll, setIsTrackingAll] = useState(false);
  const [resultByItemId, setResultByItemId] = useState<Record<string, TrackingActionResult>>({});
  const [bulkResult, setBulkResult] = useState<TrackingActionResult>({ ok: false });
  const [isPending, startTransition] = useTransition();
  const completed = new Set(completedScheduleItemIds);
  const untrackedCount = items.filter((item) => !completed.has(item.id)).length;

  function handleTrack(itemId: string) {
    const formData = new FormData();
    formData.set("id", itemId);

    setPendingItemId(itemId);
    startTransition(async () => {
      const result = await createWorkoutLogFromScheduleItem(formData);
      setResultByItemId((current) => ({ ...current, [itemId]: result }));
      setPendingItemId(null);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleTrackAll() {
    setIsTrackingAll(true);
    startTransition(async () => {
      const result = await createWorkoutLogsFromTodaySchedule();
      setBulkResult(result);
      setIsTrackingAll(false);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  if (items.length === 0) {
    return <p className="mt-3 text-sm text-zinc-600">No workouts planned for today.</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          {untrackedCount === 0 ? "All planned workouts are tracked." : `${untrackedCount} planned workout${untrackedCount === 1 ? "" : "s"} left.`}
        </p>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={untrackedCount === 0 || isPending}
          onClick={handleTrackAll}
          type="button"
        >
          {isTrackingAll ? "Tracking..." : "Track all today"}
        </button>
      </div>
      {bulkResult.error ? <p className="text-sm text-red-600">{bulkResult.error}</p> : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const isTracked = completed.has(item.id);
          const isItemPending = isPending && pendingItemId === item.id;
          const detail = plannedDetail(item);
          const result = resultByItemId[item.id];

          return (
            <li className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-4" key={item.id}>
              <div>
                <p className="font-medium text-zinc-900">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {label(item.workout_type)} - {label(item.tracking_method)}
                  {detail ? ` - ${detail}` : ""}
                </p>
                {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
                {result?.error ? <p className="mt-2 text-sm text-red-600">{result.error}</p> : null}
              </div>
              <button
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isTracked || isItemPending || isTrackingAll}
                onClick={() => handleTrack(item.id)}
                type="button"
              >
                {isTracked ? "Tracked" : isItemPending ? "Tracking..." : "Track"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
