"use client";

import { useFormStatus } from "react-dom";
import { createCourse } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Adding…" : "Add course"}
    </button>
  );
}

export function NewCourseForm() {
  return (
    <form action={createCourse} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Add course</h2>
        <p className="mt-1 text-sm text-ink-muted">Create a course to start tracking grades and deadlines.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="name">
            Name
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="name"
            name="name"
            placeholder="Ex: Organic Chemistry"
            required
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="code">
            Code
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="code"
            name="code"
            placeholder="Ex: CHEM 201"
            type="text"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="term">
            Term
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="term"
            name="term"
            placeholder="Ex: Fall 2026"
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="target_grade">
            Target grade
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            id="target_grade"
            max={100}
            min={0}
            name="target_grade"
            placeholder="90"
            type="number"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-ink-muted" htmlFor="color">
            Color
          </label>
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            id="color"
            name="color"
            placeholder="Optional"
            type="text"
          />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
