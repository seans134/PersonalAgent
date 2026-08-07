"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NaturalLanguageWorkoutDraft } from "@/lib/tracking/natural-language-workout";

type ParseResponse = { draft: NaturalLanguageWorkoutDraft } | { error: string };
type ApplyResponse = { applied: { workoutsCreated: number } } | { error: string };

function isErrorResponse(value: ParseResponse | ApplyResponse): value is { error: string } {
  return "error" in value;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatMetricValue(value: string | number | null) {
  return value === null || value === "" ? null : String(value);
}

function formatLoggedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export function NaturalLanguageWorkoutLogPanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NaturalLanguageWorkoutDraft | null>(null);
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
      const response = await fetch("/api/tracking/workouts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timezone: "America/Toronto" }),
      });
      const payload = (await response.json()) as ParseResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to parse workout.");
      }

      setDraft(payload.draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse workout.");
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
      const response = await fetch("/api/tracking/workouts/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to log workout.");
      }

      setMessage("Workout logged.");
      setText("");
      setDraft(null);
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to log workout.");
    } finally {
      setIsApplying(false);
    }
  }

  const metrics = draft
    ? Object.entries(draft.metrics ?? {}).flatMap(([key, value]) => {
        const formatted = formatMetricValue(value);
        return formatted ? [`${label(key)}: ${formatted}`] : [];
      })
    : [];

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Log from text</h2>
        <p className="mt-1 text-sm text-ink-muted">Describe a workout and review the draft before saving.</p>
      </div>

      <textarea
        className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        onChange={(event) => setText(event.target.value)}
        placeholder="Example: I ran 3 miles in 28 minutes this morning, moderate effort."
        value={text}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isParsing || text.trim().length < 8}
          onClick={handleParse}
          type="button"
        >
          {isParsing ? "Parsing..." : "Parse workout"}
        </button>
        {draft ? (
          <button
            className="rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isApplying}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Logging..." : "Log draft"}
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="rounded-lg border border-success bg-surface2 px-3 py-2 text-sm text-success">{message}</p> : null}

      {draft ? (
        <div className="rounded-lg bg-surface2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{draft.title}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {formatLoggedAt(draft.logged_at)} - {label(draft.workout_type)} - {label(draft.tracking_method)}
              </p>
            </div>
            <span className="rounded-full bg-teal px-2 py-1 text-xs font-medium capitalize text-on-teal">
              {draft.intensity}
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            {draft.duration_minutes} min
            {draft.calories_burned !== null ? ` - ${draft.calories_burned} cal` : ""}
          </p>
          {metrics.length > 0 ? <p className="mt-2 text-sm text-ink-muted">{metrics.join(" - ")}</p> : null}
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
