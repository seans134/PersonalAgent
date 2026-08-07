"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMealLog } from "../actions";
import type { TrackingActionResult } from "@/lib/tracking";

const initialResult: TrackingActionResult = { ok: false };

export function MealLogForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TrackingActionResult>(initialResult);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const nextResult = await createMealLog(formData);
      setResult(nextResult);

      if (nextResult.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Log a meal</h2>
        <p className="mt-1 text-sm text-ink-muted">Track what you ate and any macros you know.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="name">
            Meal name
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="name"
            name="name"
            placeholder="Ex: Chicken rice bowl"
            required
            type="text"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="calories">
            Calories
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="calories"
            min={0}
            name="calories"
            type="number"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="protein_grams">
            Protein g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="protein_grams"
            min={0}
            name="protein_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="carbs_grams">
            Carbs g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="carbs_grams"
            min={0}
            name="carbs_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="fat_grams">
            Fat g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="fat_grams"
            min={0}
            name="fat_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="fiber_grams">
            Fiber g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="fiber_grams"
            min={0}
            name="fiber_grams"
            step="0.1"
            type="number"
          />
        </div>
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
      {result.ok ? <p className="text-sm text-success">Meal logged.</p> : null}

      <button
        className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Logging..." : "Log meal"}
      </button>
    </form>
  );
}
