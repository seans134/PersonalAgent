"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkoutScheduleItem, removeWorkoutScheduleItem } from "../actions";
import type { TrackingActionResult, WorkoutMetrics, WorkoutTrackingMethod, WorkoutType } from "@/lib/tracking";

export type WorkoutScheduleItem = {
  id: string;
  day_of_week: number;
  position: number;
  workout_type: string;
  tracking_method: string;
  title: string;
  duration_minutes: number | null;
  metrics: WorkoutMetrics;
  notes: string | null;
};

const days = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

const workoutTypes: { value: WorkoutType; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "recovery", label: "Recovery" },
  { value: "sport", label: "Sport" },
];

const methodsByType: Record<WorkoutType, { value: WorkoutTrackingMethod; label: string }[]> = {
  strength: [
    { value: "sets_reps_weight", label: "Sets, reps, weight" },
    { value: "bodyweight_sets", label: "Bodyweight sets" },
  ],
  cardio: [
    { value: "distance_time", label: "Distance and time" },
    { value: "time_only", label: "Time only" },
    { value: "intervals", label: "Intervals" },
  ],
  recovery: [
    { value: "mobility_flow", label: "Mobility flow" },
    { value: "stretching", label: "Stretching" },
    { value: "breathwork", label: "Breathwork" },
  ],
  sport: [
    { value: "game", label: "Game" },
    { value: "practice", label: "Practice" },
    { value: "skills", label: "Skills" },
  ],
};

const initialResult: TrackingActionResult = { ok: false };
const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted";
const compactInputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-center text-sm text-ink";

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function metricText(item: WorkoutScheduleItem) {
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

export function WorkoutSchedulePanel({ items }: { items: WorkoutScheduleItem[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("strength");
  const [trackingMethod, setTrackingMethod] = useState<WorkoutTrackingMethod>("sets_reps_weight");
  const [result, setResult] = useState<TrackingActionResult>(initialResult);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const methodOptions = useMemo(() => methodsByType[workoutType], [workoutType]);
  const showPlannedStrengthMetrics = trackingMethod === "sets_reps_weight";

  function handleTypeChange(nextType: WorkoutType) {
    setWorkoutType(nextType);
    setTrackingMethod(methodsByType[nextType][0].value);
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextResult = await createWorkoutScheduleItem(formData);
      setResult(nextResult);

      if (nextResult.ok) {
        formRef.current?.reset();
        setWorkoutType("strength");
        setTrackingMethod("sets_reps_weight");
        router.refresh();
      }
    });
  }

  function handleRemove(itemId: string) {
    const formData = new FormData();
    formData.set("id", itemId);

    setPendingItemId(itemId);
    startTransition(async () => {
      const nextResult = await removeWorkoutScheduleItem(formData);
      setResult(nextResult);
      setPendingItemId(null);

      if (nextResult.ok) {
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Weekly workout schedule</h2>
        <p className="mt-1 text-sm text-ink-muted">Build a weekday list of planned workout types.</p>
      </div>

      <form ref={formRef} className="space-y-4 rounded-lg bg-surface2 p-4" onSubmit={handleAdd}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="day_of_week">
              Day
            </label>
            <select className={inputClass} defaultValue="1" id="day_of_week" name="day_of_week">
              {days.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="schedule_workout_type">
              Type
            </label>
            <select
              className={inputClass}
              id="schedule_workout_type"
              name="workout_type"
              onChange={(event) => handleTypeChange(event.target.value as WorkoutType)}
              value={workoutType}
            >
              {workoutTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="schedule_tracking_method">
              Tracking
            </label>
            <select
              className={inputClass}
              id="schedule_tracking_method"
              name="tracking_method"
              onChange={(event) => setTrackingMethod(event.target.value as WorkoutTrackingMethod)}
              value={trackingMethod}
            >
              {methodOptions.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {showPlannedStrengthMetrics ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <label className="block text-center text-sm text-ink-muted" htmlFor="schedule_sets">
                  Sets
                </label>
                <input className={compactInputClass} id="schedule_sets" min={1} name="sets" type="number" />
              </div>
              <div className="space-y-2">
                <label className="block text-center text-sm text-ink-muted" htmlFor="schedule_reps">
                  Reps
                </label>
                <input className={compactInputClass} id="schedule_reps" min={1} name="reps" type="number" />
              </div>
              <div className="space-y-2">
                <label className="block text-center text-sm text-ink-muted" htmlFor="schedule_weight">
                  Weight
                </label>
                <input className={compactInputClass} id="schedule_weight" min={0} name="weight" step="0.5" type="number" />
                <input name="weight_unit" type="hidden" value="lb" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm text-ink-muted" htmlFor="schedule_duration">
                Minutes
              </label>
              <input className={inputClass} id="schedule_duration" min={1} name="duration_minutes" type="number" />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="schedule_title">
              Workout
            </label>
            <input className={inputClass} id="schedule_title" name="title" placeholder="Upper body strength" required type="text" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="schedule_notes">
              Notes
            </label>
            <input className={inputClass} id="schedule_notes" name="notes" placeholder="Optional" type="text" />
          </div>
        </div>

        {result.error ? <p className="text-sm text-danger">{result.error}</p> : null}
        {result.ok ? <p className="text-sm text-success">Schedule updated.</p> : null}

        <button
          className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending && pendingItemId === null}
          type="submit"
        >
          {isPending && pendingItemId === null ? "Adding..." : "Add to schedule"}
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {days.map((day) => {
          const dayItems = items.filter((item) => item.day_of_week === day.value);

          return (
            <div className="rounded-lg border border-line p-4" key={day.value}>
              <h3 className="font-medium text-ink">{day.label}</h3>
              {dayItems.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">No workouts planned.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {dayItems.map((item) => {
                    const isRemoving = isPending && pendingItemId === item.id;
                    const itemMetricText = metricText(item);

                    return (
                      <li className="flex items-start justify-between gap-3 rounded-lg bg-surface2 p-3" key={item.id}>
                        <div>
                          <p className="text-sm font-medium text-ink">{item.title}</p>
                          <p className="mt-1 text-xs text-ink-muted">
                            {formatLabel(item.workout_type)} - {formatLabel(item.tracking_method)}
                            {itemMetricText ? ` - ${itemMetricText}` : ""}
                          </p>
                          {item.notes ? <p className="mt-1 text-xs text-ink-muted">{item.notes}</p> : null}
                        </div>
                        <button
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isRemoving}
                          onClick={() => handleRemove(item.id)}
                          type="button"
                        >
                          {isRemoving ? "Removing..." : "Remove"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
