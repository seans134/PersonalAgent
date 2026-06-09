"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NaturalLanguageWorkoutScheduleDraft } from "@/lib/tracking/natural-language-workout";

type ParseResponse = { draft: NaturalLanguageWorkoutScheduleDraft } | { error: string };
type ApplyResponse = { applied: { scheduleItemsCreated: number } } | { error: string };

const dayLabels: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

function isErrorResponse(value: ParseResponse | ApplyResponse): value is { error: string } {
  return "error" in value;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatMetricValue(value: string | number | null) {
  return value === null || value === "" ? null : String(value);
}

export function NaturalLanguageWorkoutPlanPanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NaturalLanguageWorkoutScheduleDraft | null>(null);
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
      const response = await fetch("/api/tracking/workouts/plan/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timezone: "America/Toronto" }),
      });
      const payload = (await response.json()) as ParseResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to parse workout plan.");
      }

      setDraft(payload.draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse workout plan.");
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
      const response = await fetch("/api/tracking/workouts/plan/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to save workout plan.");
      }

      setMessage(`Added ${payload.applied.scheduleItemsCreated} planned workouts.`);
      setText("");
      setDraft(null);
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to save workout plan.");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Plan from text</h2>
        <p className="mt-1 text-sm text-zinc-600">Describe your weekly workouts and review the schedule before saving.</p>
      </div>

      <textarea
        className="min-h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
        onChange={(event) => setText(event.target.value)}
        placeholder="Example: Monday upper body 3x10, Wednesday 30 minute run, Friday basketball practice, Sunday mobility."
        value={text}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isParsing || text.trim().length < 8}
          onClick={handleParse}
          type="button"
        >
          {isParsing ? "Parsing..." : "Parse workout plan"}
        </button>
        {draft ? (
          <button
            className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isApplying || draft.items.length === 0}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Saving..." : "Add planned workouts"}
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}

      {draft ? (
        <div className="grid gap-3 md:grid-cols-2">
          {draft.items.length === 0 ? <p className="text-sm text-zinc-600">No planned workouts found.</p> : null}
          {draft.items.map((item, index) => {
            const metrics = Object.entries(item.metrics ?? {}).flatMap(([key, value]) => {
              const formatted = formatMetricValue(value);
              return formatted ? [`${label(key)}: ${formatted}`] : [];
            });

            return (
              <div className="rounded-lg bg-zinc-50 p-4" key={`${item.day_of_week}-${item.title}-${index}`}>
                <p className="text-sm font-semibold text-zinc-900">{dayLabels[item.day_of_week] ?? item.day_of_week}</p>
                <p className="mt-1 text-base font-medium text-zinc-900">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {label(item.workout_type)} - {label(item.tracking_method)}
                  {item.duration_minutes ? ` - ${item.duration_minutes} min` : ""}
                </p>
                {metrics.length > 0 ? <p className="mt-2 text-sm text-zinc-600">{metrics.join(" - ")}</p> : null}
                {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {draft?.warnings.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
