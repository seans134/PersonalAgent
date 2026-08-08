"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CourseCategoryRow, CourseItemRow } from "@/lib/courses/types";
import { createItem, updateItem } from "../actions";

const KIND_OPTIONS: Array<{ value: CourseItemRow["kind"]; label: string }> = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
];

const FOCUS_MODE_OPTIONS: Array<{ value: CourseItemRow["focus_mode"]; label: string }> = [
  { value: "finish_first", label: "Finish first" },
  { value: "continuous", label: "Ongoing" },
  { value: "deferred", label: "Do later" },
];

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted";
const labelClass = "block text-xs text-ink-muted";

// datetime-local inputs expect "YYYY-MM-DDTHH:mm". Slicing the stored ISO string
// is acceptable here — see task brief: do not over-engineer timezone handling.
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? (isEdit ? "Saving…" : "Adding…") : isEdit ? "Save item" : "Add item"}
    </button>
  );
}

export function ItemForm({
  courseId,
  categories,
  item,
  onCancel,
}: {
  courseId: string;
  categories: CourseCategoryRow[];
  item?: CourseItemRow;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(item);
  const [kind, setKind] = useState<CourseItemRow["kind"]>(item?.kind ?? "assignment");
  const showScheduledFields = kind === "quiz" || kind === "exam";
  const formIdPrefix = item ? `item-${item.id}` : "item-new";

  return (
    <form
      action={isEdit ? updateItem : createItem}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
    >
      <input name="course_id" type="hidden" value={courseId} />
      {item ? <input name="item_id" type="hidden" value={item.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-kind`}>
            Kind
          </label>
          <select
            className={inputClass}
            defaultValue={item?.kind ?? "assignment"}
            id={`${formIdPrefix}-kind`}
            name="kind"
            onChange={(e) => setKind(e.target.value as CourseItemRow["kind"])}
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-category`}>
            Category
          </label>
          <select
            className={inputClass}
            defaultValue={item?.category_id ?? ""}
            id={`${formIdPrefix}-category`}
            name="category_id"
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass} htmlFor={`${formIdPrefix}-title`}>
          Title
        </label>
        <input
          className={inputClass}
          defaultValue={item?.title ?? ""}
          id={`${formIdPrefix}-title`}
          name="title"
          placeholder="Ex: Problem set 3"
          required
          type="text"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-due`}>
            {showScheduledFields ? "Scheduled" : "Due"}
          </label>
          <input
            className={inputClass}
            defaultValue={toDateTimeLocal(item?.due_at ?? null)}
            id={`${formIdPrefix}-due`}
            name="due_at"
            required
            type="datetime-local"
          />
        </div>

        {showScheduledFields ? (
          <div className="space-y-1">
            <label className={labelClass} htmlFor={`${formIdPrefix}-end`}>
              End time
            </label>
            <input
              className={inputClass}
              defaultValue={toDateTimeLocal(item?.end_at ?? null)}
              id={`${formIdPrefix}-end`}
              name="end_at"
              type="datetime-local"
            />
          </div>
        ) : null}
      </div>

      {showScheduledFields ? (
        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-location`}>
            Location
          </label>
          <input
            className={inputClass}
            defaultValue={item?.location ?? ""}
            id={`${formIdPrefix}-location`}
            name="location"
            placeholder="Ex: Room 204"
            type="text"
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-score-max`}>
            Score max
          </label>
          <input
            className={`${inputClass} font-mono`}
            defaultValue={item?.score_max ?? 100}
            id={`${formIdPrefix}-score-max`}
            min={0}
            name="score_max"
            type="number"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-effort`}>
            Estimated effort (hrs)
          </label>
          <input
            className={`${inputClass} font-mono`}
            defaultValue={item?.estimated_effort_hours ?? ""}
            id={`${formIdPrefix}-effort`}
            min={0}
            name="estimated_effort_hours"
            placeholder="Optional"
            step="0.5"
            type="number"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass} htmlFor={`${formIdPrefix}-focus-mode`}>
            Scheduling mode
          </label>
          <select
            className={inputClass}
            defaultValue={item?.focus_mode ?? "continuous"}
            id={`${formIdPrefix}-focus-mode`}
            name="focus_mode"
          >
            {FOCUS_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SubmitButton isEdit={isEdit} />
        {onCancel ? (
          <button
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted transition hover:bg-surface2"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AddItemPanel({
  courseId,
  categories,
}: {
  courseId: string;
  categories: CourseCategoryRow[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface2"
        onClick={() => setOpen(true)}
        type="button"
      >
        + Add item
      </button>
    );
  }

  return <ItemForm categories={categories} courseId={courseId} onCancel={() => setOpen(false)} />;
}
