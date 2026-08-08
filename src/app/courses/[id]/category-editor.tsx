"use client";

import { useFormStatus } from "react-dom";
import type { CourseCategoryRow } from "@/lib/courses/types";
import { createCategory, deleteCategory, updateCategory } from "../actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg border border-line px-3 py-2 text-sm text-danger transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Removing…" : "Delete"}
    </button>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Adding…" : "Add category"}
    </button>
  );
}

export function CategoryEditor({
  courseId,
  categories,
}: {
  courseId: string;
  categories: CourseCategoryRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3" key={category.id}>
              <form action={updateCategory} className="flex flex-1 flex-wrap items-end gap-2">
                <input name="category_id" type="hidden" value={category.id} />
                <input name="course_id" type="hidden" value={courseId} />
                <input name="position" type="hidden" value={category.position} />
                <div className="min-w-[140px] flex-1 space-y-1">
                  <label className="block text-xs text-ink-muted" htmlFor={`cat-name-${category.id}`}>
                    Name
                  </label>
                  <input
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                    defaultValue={category.name}
                    id={`cat-name-${category.id}`}
                    name="name"
                    required
                    type="text"
                  />
                </div>
                <div className="w-24 space-y-1">
                  <label className="block text-xs text-ink-muted" htmlFor={`cat-weight-${category.id}`}>
                    Weight %
                  </label>
                  <input
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-ink"
                    defaultValue={category.weight}
                    id={`cat-weight-${category.id}`}
                    max={100}
                    min={0}
                    name="weight"
                    required
                    type="number"
                  />
                </div>
                <SaveButton />
              </form>
              <form action={deleteCategory}>
                <input name="category_id" type="hidden" value={category.id} />
                <input name="course_id" type="hidden" value={courseId} />
                <DeleteButton />
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No categories yet. Add one below to start weighting grades.</p>
      )}

      <form action={createCategory} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <input name="course_id" type="hidden" value={courseId} />
        <div className="min-w-[140px] flex-1 space-y-1">
          <label className="block text-xs text-ink-muted" htmlFor="new-category-name">
            Name
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="new-category-name"
            name="name"
            placeholder="Ex: Homework"
            required
            type="text"
          />
        </div>
        <div className="w-24 space-y-1">
          <label className="block text-xs text-ink-muted" htmlFor="new-category-weight">
            Weight %
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-ink"
            id="new-category-weight"
            max={100}
            min={0}
            name="weight"
            placeholder="20"
            type="number"
          />
        </div>
        <AddButton />
      </form>
    </div>
  );
}
