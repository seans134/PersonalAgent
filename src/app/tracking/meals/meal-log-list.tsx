"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeMealLog, saveMeal, updateMealLog } from "../actions";
import type { TrackingActionResult } from "@/lib/tracking";

export type MealLogListItem = {
  id: string;
  logged_at: string;
  meal_type: string;
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return Number(value).toLocaleString();
}

function inputValue(value: number | null) {
  return value === null ? "" : String(value);
}

export function MealLogList({ meals }: { meals: MealLogListItem[] }) {
  const router = useRouter();
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [resultByMealId, setResultByMealId] = useState<Record<string, TrackingActionResult>>({});
  const [pendingMealId, setPendingMealId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setMealResult(mealId: string, result: TrackingActionResult) {
    setResultByMealId((current) => ({ ...current, [mealId]: result }));
  }

  function handleSave(event: FormEvent<HTMLFormElement>, mealId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setPendingMealId(mealId);
    startTransition(async () => {
      const result = await updateMealLog(formData);
      setMealResult(mealId, result);
      setPendingMealId(null);

      if (result.ok) {
        setEditingMealId(null);
        router.refresh();
      }
    });
  }

  function handleSaveMeal(form: HTMLFormElement, mealId: string) {
    const formData = new FormData(form);

    setPendingMealId(mealId);
    startTransition(async () => {
      const result = await saveMeal(formData);
      setMealResult(mealId, result);
      setPendingMealId(null);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleRemove(mealId: string) {
    const formData = new FormData();
    formData.set("id", mealId);

    setPendingMealId(mealId);
    startTransition(async () => {
      const result = await removeMealLog(formData);
      setMealResult(mealId, result);
      setPendingMealId(null);

      if (result.ok) {
        setEditingMealId(null);
        router.refresh();
      }
    });
  }

  if (meals.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">No meals logged today.</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {meals.map((meal) => {
        const isEditing = editingMealId === meal.id;
        const isMealPending = isPending && pendingMealId === meal.id;
        const result = resultByMealId[meal.id];

        return (
          <li className="rounded-lg border border-line p-4" key={meal.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{meal.name}</p>
                <p className="mt-1 text-sm text-ink-muted">{formatTime(meal.logged_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-sm font-medium text-ink">{formatNumber(meal.calories)} cal</p>
                <button
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink"
                  onClick={() => setEditingMealId(isEditing ? null : meal.id)}
                  type="button"
                >
                  {isEditing ? "Close" : "Edit"}
                </button>
              </div>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Protein {formatNumber(meal.protein_grams)}g - Carbs {formatNumber(meal.carbs_grams)}g - Fat{" "}
              {formatNumber(meal.fat_grams)}g - Fiber {formatNumber(meal.fiber_grams)}g
            </p>
            {meal.notes ? <p className="mt-2 text-sm text-ink-muted">{meal.notes}</p> : null}

            {isEditing ? (
              <form className="mt-4 space-y-4 border-t border-line pt-4" onSubmit={(event) => handleSave(event, meal.id)}>
                <input name="id" type="hidden" value={meal.id} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`name-${meal.id}`}>
                      Meal name
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={meal.name}
                      id={`name-${meal.id}`}
                      name="name"
                      required
                      type="text"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`calories-${meal.id}`}>
                      Calories
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={inputValue(meal.calories)}
                      id={`calories-${meal.id}`}
                      min={0}
                      name="calories"
                      type="number"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`protein-${meal.id}`}>
                      Protein g
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={inputValue(meal.protein_grams)}
                      id={`protein-${meal.id}`}
                      min={0}
                      name="protein_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`carbs-${meal.id}`}>
                      Carbs g
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={inputValue(meal.carbs_grams)}
                      id={`carbs-${meal.id}`}
                      min={0}
                      name="carbs_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`fat-${meal.id}`}>
                      Fat g
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={inputValue(meal.fat_grams)}
                      id={`fat-${meal.id}`}
                      min={0}
                      name="fat_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-ink-muted" htmlFor={`fiber-${meal.id}`}>
                      Fiber g
                    </label>
                    <input
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      defaultValue={inputValue(meal.fiber_grams)}
                      id={`fiber-${meal.id}`}
                      min={0}
                      name="fiber_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-ink-muted" htmlFor={`notes-${meal.id}`}>
                    Notes
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    defaultValue={meal.notes ?? ""}
                    id={`notes-${meal.id}`}
                    name="notes"
                  />
                </div>

                {result?.error ? <p className="text-sm text-danger">{result.error}</p> : null}
                {result?.ok ? <p className="text-sm text-success">Saved.</p> : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMealPending}
                    type="submit"
                  >
                    {isMealPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMealPending}
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (form) {
                        handleSaveMeal(form, meal.id);
                      }
                    }}
                    type="button"
                  >
                    Save meal
                  </button>
                  <button
                    className="rounded-lg border border-danger bg-danger px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMealPending}
                    onClick={() => handleRemove(meal.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
