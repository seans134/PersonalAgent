"use client";

import { useReducer } from "react";
import type { TodayPlanResponse } from "@/lib/planner/client-types";
import { TodayPlanMeridian } from "./today-plan-meridian";
import {
  initialTodayPlanState,
  parseTodayPlanResponse,
  reduceTodayPlanState,
} from "./today-plan-state";

const legend = [
  { key: "goal", label: "Goal", color: "var(--color-goal)" },
  { key: "focus", label: "Focus", color: "var(--color-focus)" },
  { key: "fitness", label: "Fitness", color: "var(--color-fitness)" },
  { key: "wellness", label: "Wellness", color: "var(--color-wellness)" },
  { key: "commit", label: "Fixed", color: "var(--color-commit)" },
];

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

async function requestTodayPlan(): Promise<TodayPlanResponse> {
  const response = await fetch("/api/plan/today", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
      throw new Error(payload.error);
    }
    throw new Error("Unable to generate today plan.");
  }

  return parseTodayPlanResponse(payload);
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface2 px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-teal">{value}</p>
    </div>
  );
}

export function TodayPlanPanel() {
  const [state, dispatch] = useReducer(reduceTodayPlanState, initialTodayPlanState);

  const isLoading = state.status === "loading";
  const planData = state.status === "success" ? state.data : null;
  const errorMessage = state.status === "error" ? state.error : null;

  async function handleGeneratePlan() {
    dispatch({ type: "start" });
    try {
      const payload = await requestTodayPlan();
      dispatch({ type: "succeeded", payload });
    } catch (error) {
      dispatch({
        type: "failed",
        message: error instanceof Error ? error.message : "Unable to generate today plan.",
      });
    }
  }

  return (
    <section className="space-y-4 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Today, charted</h2>
          <p className="text-sm text-ink-muted">A route through your day from your goals, preferences, and calendar.</p>
        </div>
        <button
          className="inline-flex items-center rounded-[11px] bg-teal px-5 py-2.5 font-display text-sm font-medium text-on-teal transition hover:bg-teal-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={handleGeneratePlan}
          type="button"
        >
          {isLoading ? "Charting..." : "Generate today"}
        </button>
      </div>

      {errorMessage ? (
        <p className="rounded-[11px] border border-danger border-l-[3px] bg-surface px-4 py-3 text-sm text-danger">{errorMessage}</p>
      ) : null}

      {planData ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Goals used" value={planData.meta.goalsCount} />
            <StatTile label="Events" value={planData.meta.eventsCount} />
            <StatTile label="Moves" value={planData.plan.items.length} />
          </div>

          {planData.meta.warnings.length > 0 ? (
            <div className="rounded-[11px] border border-warning border-l-[3px] bg-surface px-4 py-3 text-sm text-warning">
              <p className="font-semibold">Heads up</p>
              <ul className="mt-1 list-disc pl-5">
                {planData.meta.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {planData.plan.explanation ? (
            <p className="rounded-[11px] border border-line bg-surface2 px-4 py-3 text-sm text-ink-muted">{planData.plan.explanation}</p>
          ) : null}
          {planData.summary ? (
            <p className="rounded-[11px] border border-line border-l-[3px] border-l-teal bg-surface2 px-4 py-3 text-sm text-ink">{planData.summary}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold tracking-tight text-ink">Your day</h3>
            <div className="flex flex-wrap gap-3">
              {legend.map((entry) => (
                <span className="flex items-center gap-1.5" key={entry.key}>
                  <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: entry.color }} />
                  <span className="font-mono text-[11px] text-ink-muted">{entry.label}</span>
                </span>
              ))}
            </div>
          </div>

          <TodayPlanMeridian
            contextEvents={planData.contextEvents}
            generatedAt={planData.meta.generatedAt}
            items={planData.plan.items}
          />
          <p className="text-right font-mono text-[11px] text-ink-muted">Charted {formatGeneratedAt(planData.meta.generatedAt)}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No plan yet — generate one to chart your day.</p>
      )}
    </section>
  );
}
