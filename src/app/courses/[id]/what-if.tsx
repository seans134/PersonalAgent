"use client";

import { useId, useState } from "react";
import {
  formatGradePercent,
  parsePercentInput,
  projectFinalGrade,
  type GradeCategory,
  type GradedItem,
} from "@personal-agent/core";

// Tolerance matching packages/core needed.ts: below this there is no ungraded work left.
const EPS = 1e-9;

export function WhatIfProjection({ categories, items }: { categories: GradeCategory[]; items: GradedItem[] }) {
  const inputId = useId();
  const [text, setText] = useState("");

  const low = projectFinalGrade(categories, items, 0);
  const high = projectFinalGrade(categories, items, 100);
  if (low === null || high === null || high - low <= EPS) return null;

  const assumed = parsePercentInput(text);
  const projected = assumed === null ? null : projectFinalGrade(categories, items, assumed);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
      <label htmlFor={inputId}>If I average</label>
      <input
        className="w-20 rounded-lg border border-line bg-surface px-2 py-1 font-mono text-sm text-ink"
        id={inputId}
        inputMode="decimal"
        max={100}
        min={0}
        onChange={(event) => setText(event.target.value)}
        placeholder="80"
        step="any"
        type="number"
        value={text}
      />
      <span>% on the rest, I finish with</span>
      <span aria-live="polite">
        <span className="font-mono font-semibold">{projected === null ? "—" : formatGradePercent(projected)}</span>.
      </span>
    </div>
  );
}
