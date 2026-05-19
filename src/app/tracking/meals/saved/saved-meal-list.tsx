"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMealLogFromSavedMeal, removeSavedMeal, updateSavedMeal } from "../../actions";
import type { TrackingActionResult } from "@/lib/tracking";

export type SavedMealListItem = {
  id: string;
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return Number(value).toLocaleString();
}

function inputValue(value: number | null) {
  return value === null ? "" : String(value);
}

export function SavedMealList({ savedMeals }: { savedMeals: SavedMealListItem[] }) {
  const router = useRouter();
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [resultByMealId, setResultByMealId] = useState<Record<string, TrackingActionResult>>({});
  const [successMessageByMealId, setSuccessMessageByMealId] = useState<Record<string, string>>({});
  const [pendingMealId, setPendingMealId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setMealResult(savedMealId: string, result: TrackingActionResult, successMessage: string) {
    setResultByMealId((current) => ({ ...current, [savedMealId]: result }));
    setSuccessMessageByMealId((current) => ({ ...current, [savedMealId]: successMessage }));
  }

  function handleTrack(savedMealId: string) {
    const formData = new FormData();
    formData.set("saved_meal_id", savedMealId);

    setPendingMealId(savedMealId);
    startTransition(async () => {
      const result = await createMealLogFromSavedMeal(formData);
      setMealResult(savedMealId, result, "Tracked for today.");
      setPendingMealId(null);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  function handleSave(event: FormEvent<HTMLFormElement>, savedMealId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setPendingMealId(savedMealId);
    startTransition(async () => {
      const result = await updateSavedMeal(formData);
      setMealResult(savedMealId, result, "Saved meal updated.");
      setPendingMealId(null);

      if (result.ok) {
        setEditingMealId(null);
        router.refresh();
      }
    });
  }

  function handleRemove(savedMealId: string) {
    const formData = new FormData();
    formData.set("id", savedMealId);

    setPendingMealId(savedMealId);
    startTransition(async () => {
      const result = await removeSavedMeal(formData);
      setMealResult(savedMealId, result, "Saved meal removed.");
      setPendingMealId(null);

      if (result.ok) {
        setEditingMealId(null);
        router.refresh();
      }
    });
  }

  if (savedMeals.length === 0) {
    return <p className="text-sm text-zinc-600">No saved meals yet. Save one from today&apos;s tracked meals first.</p>;
  }

  return (
    <ul className="space-y-3">
      {savedMeals.map((meal) => {
        const isEditing = editingMealId === meal.id;
        const isMealPending = isPending && pendingMealId === meal.id;
        const result = resultByMealId[meal.id];
        const successMessage = successMessageByMealId[meal.id] ?? "Done.";

        return (
          <li className="rounded-lg border border-zinc-200 p-4" key={meal.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-zinc-900">{meal.name}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {formatNumber(meal.calories)} cal - P {formatNumber(meal.protein_grams)}g / C{" "}
                  {formatNumber(meal.carbs_grams)}g / F {formatNumber(meal.fat_grams)}g / Fiber{" "}
                  {formatNumber(meal.fiber_grams)}g
                </p>
                {meal.notes ? <p className="mt-2 text-sm text-zinc-600">{meal.notes}</p> : null}
              </div>
              <button
                className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isMealPending}
                onClick={() => handleTrack(meal.id)}
                type="button"
              >
                {isMealPending ? "Tracking..." : "Track"}
              </button>
              <button
                className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
                onClick={() => setEditingMealId(isEditing ? null : meal.id)}
                type="button"
              >
                {isEditing ? "Close" : "Edit"}
              </button>
            </div>
            {result?.error ? <p className="mt-3 text-sm text-red-600">{result.error}</p> : null}
            {result?.ok ? <p className="mt-3 text-sm text-emerald-700">{successMessage}</p> : null}

            {isEditing ? (
              <form className="mt-4 space-y-4 border-t border-zinc-200 pt-4" onSubmit={(event) => handleSave(event, meal.id)}>
                <input name="id" type="hidden" value={meal.id} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-name-${meal.id}`}>
                      Meal name
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={meal.name}
                      id={`saved-name-${meal.id}`}
                      name="name"
                      required
                      type="text"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-calories-${meal.id}`}>
                      Calories
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={inputValue(meal.calories)}
                      id={`saved-calories-${meal.id}`}
                      min={0}
                      name="calories"
                      type="number"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-protein-${meal.id}`}>
                      Protein g
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={inputValue(meal.protein_grams)}
                      id={`saved-protein-${meal.id}`}
                      min={0}
                      name="protein_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-carbs-${meal.id}`}>
                      Carbs g
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={inputValue(meal.carbs_grams)}
                      id={`saved-carbs-${meal.id}`}
                      min={0}
                      name="carbs_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-fat-${meal.id}`}>
                      Fat g
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={inputValue(meal.fat_grams)}
                      id={`saved-fat-${meal.id}`}
                      min={0}
                      name="fat_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`saved-fiber-${meal.id}`}>
                      Fiber g
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={inputValue(meal.fiber_grams)}
                      id={`saved-fiber-${meal.id}`}
                      min={0}
                      name="fiber_grams"
                      step="0.1"
                      type="number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm text-zinc-700" htmlFor={`saved-notes-${meal.id}`}>
                    Notes
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    defaultValue={meal.notes ?? ""}
                    id={`saved-notes-${meal.id}`}
                    name="notes"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isMealPending}
                    type="submit"
                  >
                    {isMealPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="rounded-lg border border-red-700 bg-red-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
