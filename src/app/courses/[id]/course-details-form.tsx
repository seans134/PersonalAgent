"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LETTER_GRADES } from "@personal-agent/core";
import type { CourseRow } from "@/lib/courses/types";

const inputClass = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";

function numberText(value: number | null): string {
  return value === null ? "" : String(Number(value));
}

/** Edits the course's details, including the credits and final grade that GPA uses. */
export function CourseDetailsForm({ course }: { course: CourseRow }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: course.name,
    code: course.code ?? "",
    term: course.term ?? "",
    targetGrade: numberText(course.target_grade),
    credits: numberText(course.credits),
    finalGrade: course.final_grade_override ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/mobile/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          term: form.term,
          targetGrade: form.targetGrade.trim() || null,
          credits: form.credits.trim() || null,
          finalGrade: form.finalGrade || null,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to save course.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <summary className="cursor-pointer font-display text-lg font-semibold tracking-tight text-ink">Course details</summary>
      <form className="mt-4 flex flex-col gap-3" onSubmit={save}>
        <label className="text-sm font-medium text-ink">
          Name
          <input className={inputClass} onChange={(e) => update("name", e.target.value)} required value={form.name} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-ink">
            Code
            <input className={inputClass} onChange={(e) => update("code", e.target.value)} placeholder="CHEM 201" value={form.code} />
          </label>
          <label className="text-sm font-medium text-ink">
            Term
            <input className={inputClass} onChange={(e) => update("term", e.target.value)} placeholder="Fall 2026" value={form.term} />
          </label>
          <label className="text-sm font-medium text-ink">
            Target grade (%)
            <input
              className={inputClass}
              inputMode="decimal"
              max={100}
              min={0}
              onChange={(e) => update("targetGrade", e.target.value)}
              step="any"
              type="number"
              value={form.targetGrade}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Credits
            <input
              className={inputClass}
              inputMode="decimal"
              max={20}
              min={0}
              onChange={(e) => update("credits", e.target.value)}
              placeholder="3"
              step="any"
              type="number"
              value={form.credits}
            />
          </label>
        </div>
        <label className="text-sm font-medium text-ink">
          Final grade
          <select className={inputClass} onChange={(e) => update("finalGrade", e.target.value)} value={form.finalGrade}>
            <option value="">Not final yet (use my current grade)</option>
            {LETTER_GRADES.map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-muted">
          Once the course is over, set the letter from your transcript so your{" "}
          <Link className="text-teal hover:underline" href="/courses/gpa">
            GPA
          </Link>{" "}
          uses it.
        </p>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        {saved ? <p className="text-sm text-success" role="status">Saved.</p> : null}
        <button
          className="w-fit rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:opacity-50"
          disabled={busy || !form.name.trim()}
          type="submit"
        >
          {busy ? "Saving..." : "Save details"}
        </button>
      </form>
    </details>
  );
}
