"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NaturalLanguageMealDraft, NaturalLanguageMealMode } from "@/lib/tracking/natural-language-meal";

type ParseResponse = { draft: NaturalLanguageMealDraft } | { error: string };
type ApplyResponse = { applied: { mealsLogged?: number; savedMealsCreated?: number } } | { error: string };

const MODE_COPY: Record<
  NaturalLanguageMealMode,
  {
    applyUrl: string;
    description: string;
    parseLabel: string;
    placeholder: string;
    success: string;
    title: string;
  }
> = {
  log: {
    applyUrl: "/api/tracking/meals/apply",
    description: "Describe what you ate and review the nutrition draft before saving.",
    parseLabel: "Parse meal",
    placeholder: "Example: Lunch was a chicken rice bowl, about 650 calories, 42g protein.",
    success: "Meal logged.",
    title: "Log from text",
  },
  saved: {
    applyUrl: "/api/tracking/meals/saved/apply",
    description: "Describe a reusable meal and review the nutrition draft before saving.",
    parseLabel: "Parse saved meal",
    placeholder: "Example: My usual chicken rice bowl is 650 calories, 42g protein, 70g carbs, 18g fat.",
    success: "Saved meal added.",
    title: "Add saved meal from text",
  },
};

function isErrorResponse(value: ParseResponse | ApplyResponse): value is { error: string } {
  return "error" in value;
}

function formatNumber(value: number | null) {
  return value === null ? "-" : String(value);
}

function formatLoggedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export function NaturalLanguageMealPanel({ mode }: { mode: NaturalLanguageMealMode }) {
  const router = useRouter();
  const copy = MODE_COPY[mode];
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NaturalLanguageMealDraft | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  async function handleParse() {
    setError("");
    setMessage("");
    setDraft(null);
    setIsParsing(true);

    try {
      const response = await fetch(mode === "log" ? "/api/tracking/meals/parse" : "/api/tracking/meals/saved/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timezone: "America/Toronto" }),
      });
      const payload = (await response.json()) as ParseResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to parse meal.");
      }

      setDraft(payload.draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse meal.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleApply() {
    if (!draft) return;

    setError("");
    setMessage("");
    setIsApplying(true);

    try {
      const response = await fetch(copy.applyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to save meal.");
      }

      setMessage(copy.success);
      setText("");
      setDraft(null);
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to save meal.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">{copy.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{copy.description}</p>
      </div>

      <textarea
        className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        onChange={(event) => setText(event.target.value)}
        placeholder={copy.placeholder}
        value={text}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isParsing || text.trim().length < 8}
          onClick={handleParse}
          type="button"
        >
          {isParsing ? "Parsing..." : copy.parseLabel}
        </button>
        {draft ? (
          <button
            className="rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isApplying}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Saving..." : "Save draft"}
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="rounded-lg border border-success bg-surface2 px-3 py-2 text-sm text-success">{message}</p> : null}

      {draft ? (
        <div className="rounded-lg bg-surface2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{draft.name}</p>
              {draft.mode === "log" ? (
                <p className="mt-1 text-sm text-ink-muted">
                  {formatLoggedAt(draft.logged_at)} - {draft.meal_type}
                </p>
              ) : null}
            </div>
            <span className="rounded-full bg-teal px-2 py-1 text-xs font-medium text-on-teal">
              {formatNumber(draft.calories)} cal
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-ink-muted sm:grid-cols-4">
            <p>Protein: {formatNumber(draft.protein_grams)}g</p>
            <p>Carbs: {formatNumber(draft.carbs_grams)}g</p>
            <p>Fat: {formatNumber(draft.fat_grams)}g</p>
            <p>Fiber: {formatNumber(draft.fiber_grams)}g</p>
          </div>
          {draft.notes ? <p className="mt-2 text-sm text-ink-muted">{draft.notes}</p> : null}
        </div>
      ) : null}

      {draft?.warnings.length ? (
        <div className="rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-warning">
          <p className="font-medium">Review notes</p>
          <ul className="mt-1 list-disc pl-5">
            {draft.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
