"use client";

import { useState } from "react";
import { completeGoal, removeGoal, updateGoal } from "./actions";

type GoalListItem = {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  minimum_daily_minutes: number | null;
  end_date: string | null;
  completed_at: string | null;
};

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

export function GoalsList({ goals }: { goals: GoalListItem[] }) {
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  if (goals.length === 0) {
    return <p className="text-zinc-700">No goals saved yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {goals.map((goal) => {
        const isEditing = editingGoalId === goal.id;

        return (
          <li className="rounded-lg border border-zinc-200 p-4" key={goal.id}>
            {isEditing ? (
              <form action={updateGoal} className="space-y-4">
                <input name="id" type="hidden" value={goal.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`title-${goal.id}`}>
                      Goal title
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
                      defaultValue={goal.title}
                      id={`title-${goal.id}`}
                      name="title"
                      required
                      type="text"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`end-date-${goal.id}`}>
                      End date
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={goal.end_date ?? ""}
                      id={`end-date-${goal.id}`}
                      name="end_date"
                      type="date"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`task-type-${goal.id}`}>
                      Task type
                    </label>
                    <select
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={goal.task_type ?? "general"}
                      id={`task-type-${goal.id}`}
                      name="task_type"
                    >
                      <option value="general">General</option>
                      <option value="focus">Focus</option>
                      <option value="fitness">Fitness</option>
                      <option value="wellness">Wellness</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-zinc-700" htmlFor={`minimum-daily-minutes-${goal.id}`}>
                      Minimum daily minutes
                    </label>
                    <input
                      className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                      defaultValue={goal.minimum_daily_minutes ?? 0}
                      id={`minimum-daily-minutes-${goal.id}`}
                      max={720}
                      min={0}
                      name="minimum_daily_minutes"
                      type="number"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm text-zinc-700" htmlFor={`description-${goal.id}`}>
                    Description
                  </label>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
                    defaultValue={goal.description ?? ""}
                    id={`description-${goal.id}`}
                    name="description"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
                    Save
                  </button>
                  <button
                    className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900"
                    onClick={() => setEditingGoalId(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-zinc-900">{goal.title}</p>
                  {goal.description ? <p className="mt-1 text-sm text-zinc-700">{goal.description}</p> : null}
                  <p className="mt-1 text-sm text-zinc-600">
                    {goal.completed_at
                      ? `Completed ${formatDateOnly(goal.completed_at.slice(0, 10))}`
                      : goal.end_date
                        ? `Ends ${formatDateOnly(goal.end_date)}`
                        : "No end date"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {goal.task_type ?? "general"} · {goal.minimum_daily_minutes ?? 0} min/day minimum
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <form action={completeGoal}>
                    <input name="id" type="hidden" value={goal.id} />
                    <button
                      className="rounded-lg border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-emerald-200 disabled:bg-emerald-100 disabled:text-emerald-700"
                      disabled={Boolean(goal.completed_at)}
                      type="submit"
                    >
                      Complete
                    </button>
                  </form>
                  <button
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
                    onClick={() => setEditingGoalId(goal.id)}
                    type="button"
                  >
                    Edit
                  </button>
                  <form action={removeGoal}>
                    <input name="id" type="hidden" value={goal.id} />
                    <button
                      className="rounded-lg border border-red-700 bg-red-600 px-4 py-2 text-sm font-medium text-white"
                      type="submit"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
