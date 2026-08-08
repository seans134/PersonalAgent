"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CourseCategoryRow, CourseItemRow } from "@/lib/courses/types";
import { deleteItem, setItemGrade } from "../actions";
import { ItemForm } from "./item-form";

const KIND_LABEL: Record<CourseItemRow["kind"], string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
};

const FOCUS_MODE_LABEL: Record<CourseItemRow["focus_mode"], string> = {
  finish_first: "Finish first",
  continuous: "Ongoing",
  deferred: "Do later",
};

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function ItemRow({
  item,
  categories,
}: {
  item: CourseItemRow;
  categories: CourseCategoryRow[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <ItemForm categories={categories} courseId={item.course_id} item={item} onCancel={() => setEditing(false)} />;
  }

  const timeLabel =
    item.kind === "assignment"
      ? `Due ${formatDueDate(item.due_at)}`
      : [formatScheduledTime(item.due_at), item.location].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
      <span className="inline-flex items-center rounded-full border border-line bg-surface2 px-2.5 py-1 text-xs font-medium text-ink-muted">
        {KIND_LABEL[item.kind]}
      </span>

      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-medium text-ink">{item.title}</p>
        <p className="font-mono text-xs text-ink-muted">{timeLabel}</p>
      </div>

      <span className="inline-flex items-center rounded-full border border-line bg-surface2 px-2.5 py-1 text-xs text-ink-muted">
        {FOCUS_MODE_LABEL[item.focus_mode]}
      </span>

      <form action={setItemGrade} className="flex items-center gap-1">
        <input name="item_id" type="hidden" value={item.id} />
        <input name="course_id" type="hidden" value={item.course_id} />
        <label className="sr-only" htmlFor={`g-${item.id}`}>
          Grade earned for {item.title}
        </label>
        <input
          className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink font-mono"
          defaultValue={item.score_earned ?? ""}
          id={`g-${item.id}`}
          inputMode="decimal"
          min={0}
          name="score_earned"
          onBlur={(e) => {
            const current = e.currentTarget.value.trim();
            const existing = item.score_earned === null ? "" : String(item.score_earned);
            if (current === existing) return;
            e.currentTarget.form?.requestSubmit();
          }}
          type="number"
        />
        <span className="font-mono text-sm text-ink-muted">/ {item.score_max}</span>
      </form>

      <button
        className="rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:bg-surface2"
        onClick={() => setEditing(true)}
        type="button"
      >
        Edit
      </button>

      <form action={deleteItem}>
        <input name="item_id" type="hidden" value={item.id} />
        <input name="course_id" type="hidden" value={item.course_id} />
        <DeleteButton />
      </form>
    </div>
  );
}
