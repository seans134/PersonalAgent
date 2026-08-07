"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkoutLog } from "../actions";
import type { TrackingActionResult, WorkoutTrackingMethod, WorkoutType } from "@/lib/tracking";

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

function Field({
  label,
  name,
  type = "text",
  min,
  step,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  min?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-ink-muted" htmlFor={name}>
        {label}
      </label>
      <input className={inputClass} id={name} min={min} name={name} placeholder={placeholder} step={step} type={type} />
    </div>
  );
}

function MethodFields({ method }: { method: WorkoutTrackingMethod }) {
  if (method === "sets_reps_weight") {
    return (
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Exercise" name="exercise_name" placeholder="Bench press" />
        <Field label="Sets" min={1} name="sets" type="number" />
        <Field label="Reps" min={1} name="reps" type="number" />
        <Field label="Weight" min={0} name="weight" step="0.5" type="number" />
        <input name="weight_unit" type="hidden" value="lb" />
      </div>
    );
  }

  if (method === "bodyweight_sets") {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Exercise" name="exercise_name" placeholder="Push-ups" />
        <Field label="Sets" min={1} name="sets" type="number" />
        <Field label="Reps" min={1} name="reps" type="number" />
      </div>
    );
  }

  if (method === "distance_time") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Distance" min={0} name="distance" step="0.01" type="number" />
        <input name="distance_unit" type="hidden" value="mi" />
      </div>
    );
  }

  if (method === "intervals") {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Intervals" min={1} name="intervals" type="number" />
        <Field label="Work seconds" min={1} name="work_seconds" type="number" />
        <Field label="Rest seconds" min={1} name="rest_seconds" type="number" />
      </div>
    );
  }

  if (method === "mobility_flow" || method === "stretching") {
    return <Field label="Focus area" name="focus_area" placeholder="Hips, back, shoulders" />;
  }

  if (method === "breathwork") {
    return <Field label="Rounds" min={1} name="rounds" type="number" />;
  }

  if (method === "game") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sport" name="sport_name" placeholder="Basketball" />
        <Field label="Result" name="result" placeholder="Won 42-38" />
      </div>
    );
  }

  if (method === "practice") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sport" name="sport_name" placeholder="Soccer" />
        <Field label="Drill" name="drill" placeholder="Shooting" />
      </div>
    );
  }

  if (method === "skills") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sport" name="sport_name" placeholder="Tennis" />
        <Field label="Skill" name="skill" placeholder="Serve practice" />
      </div>
    );
  }

  return null;
}

export function WorkoutLogForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [workoutType, setWorkoutType] = useState<WorkoutType>("strength");
  const [trackingMethod, setTrackingMethod] = useState<WorkoutTrackingMethod>("sets_reps_weight");
  const [result, setResult] = useState<TrackingActionResult>(initialResult);
  const [pending, startTransition] = useTransition();

  const methodOptions = useMemo(() => methodsByType[workoutType], [workoutType]);

  function handleTypeChange(nextType: WorkoutType) {
    setWorkoutType(nextType);
    setTrackingMethod(methodsByType[nextType][0].value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextResult = await createWorkoutLog(formData);
      setResult(nextResult);

      if (nextResult.ok) {
        formRef.current?.reset();
        setWorkoutType("strength");
        setTrackingMethod("sets_reps_weight");
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Log a workout</h2>
        <p className="mt-1 text-sm text-ink-muted">Choose the workout type, then track the details that fit it.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="workout_type">
            Type
          </label>
          <select
            className={inputClass}
            id="workout_type"
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
          <label className="block text-sm text-ink-muted" htmlFor="tracking_method">
            Tracking
          </label>
          <select
            className={inputClass}
            id="tracking_method"
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Workout title" name="title" placeholder="Upper body" />
        <Field label="Duration minutes" min={1} name="duration_minutes" type="number" />
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="intensity">
            Intensity
          </label>
          <select className={inputClass} defaultValue="moderate" id="intensity" name="intensity">
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="intense">Intense</option>
          </select>
        </div>
      </div>

      <MethodFields method={trackingMethod} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Calories burned" min={0} name="calories_burned" type="number" />
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-ink-muted" htmlFor="notes">
          Notes
        </label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          id="notes"
          name="notes"
          placeholder="Optional notes"
        />
      </div>

      {result.error ? <p className="text-sm text-danger">{result.error}</p> : null}
      {result.ok ? <p className="text-sm text-success">Workout logged.</p> : null}

      <button
        className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Logging..." : "Log workout"}
      </button>
    </form>
  );
}
