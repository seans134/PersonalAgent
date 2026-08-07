"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMeal } from "../../actions";
import type { TrackingActionResult } from "@/lib/tracking";

export function SavedMealForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TrackingActionResult>({ ok: false });
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextResult = await saveMeal(formData);
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
        <h2 className="text-lg font-semibold text-ink">Add saved meal</h2>
        <p className="mt-1 text-sm text-ink-muted">Create a reusable meal you can track later.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-name">
            Meal name
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="saved-name"
            name="name"
            placeholder="Ex: Chicken rice bowl"
            required
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-calories">
            Calories
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="saved-calories"
            min={0}
            name="calories"
            type="number"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-protein">
            Protein g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="saved-protein"
            min={0}
            name="protein_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-carbs">
            Carbs g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="saved-carbs"
            min={0}
            name="carbs_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-fat">
            Fat g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="saved-fat"
            min={0}
            name="fat_grams"
            step="0.1"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="saved-fiber">
            Fiber g
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="saved-fiber"
            min={0}
            name="fiber_grams"
            step="0.1"
            type="number"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-ink-muted" htmlFor="saved-notes">
          Notes
        </label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          id="saved-notes"
          name="notes"
          placeholder="Optional notes"
        />
      </div>

      {result.error ? <p className="text-sm text-danger">{result.error}</p> : null}
      {result.ok ? <p className="text-sm text-success">Saved meal added.</p> : null}

      <button
        className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Adding..." : "Add saved meal"}
      </button>
    </form>
  );
}
