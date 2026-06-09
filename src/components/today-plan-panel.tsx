"use client";

import { useReducer } from "react";
import type { TodayPlanResponse } from "@/lib/planner/client-types";
import { TodayPlanCalendar } from "./today-plan-calendar";
import {
  initialTodayPlanState,
  parseTodayPlanResponse,
  reduceTodayPlanState,
} from "./today-plan-state";

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
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Today&apos;s Plan</h2>
          <p className="text-sm text-zinc-600">Generate actions from your goals, preferences, and calendar.</p>
        </div>
        <button
          className="inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={handleGeneratePlan}
          type="button"
        >
          {isLoading ? "Generating..." : "Generate Today Plan"}
        </button>
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {planData ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Goals Used</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{planData.meta.goalsCount}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Events Considered</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{planData.meta.eventsCount}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Generated</p>
              <p className="mt-2 text-sm font-medium text-zinc-900">{formatGeneratedAt(planData.meta.generatedAt)}</p>
            </div>
          </div>

          {planData.meta.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {planData.meta.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {planData.plan.explanation ? (
            <p className="rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{planData.plan.explanation}</p>
          ) : null}
          {planData.summary ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{planData.summary}</p>
          ) : null}

          <TodayPlanCalendar
            contextEvents={planData.contextEvents}
            generatedAt={planData.meta.generatedAt}
            items={planData.plan.items}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No plan generated yet.</p>
      )}
    </section>
  );
}
