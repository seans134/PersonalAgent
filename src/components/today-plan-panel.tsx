"use client";

import { useReducer, useState } from "react";
import {
  analyticsEvents,
  applyPlanItemStatus,
  features,
  nextPlanItemStatus,
  planCheckoffCounts,
  type PlanAcceptResponse,
  type PlanItemStatus,
  type PlanItemStatusResponse,
  type PlannedItem,
} from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";
import type { TodayPlanResponse } from "@/lib/planner/client-types";
import { TodayPlanMeridian } from "./today-plan-meridian";
import {
  initialTodayPlanState,
  parseTodayPlanResponse,
  reduceTodayPlanState,
} from "./today-plan-state";

const allLegend = [
  { key: "goal", label: "Goal", color: "var(--color-goal)" },
  { key: "focus", label: "Study", color: "var(--color-focus)" },
  { key: "fitness", label: "Fitness", color: "var(--color-fitness)" },
  { key: "wellness", label: "Wellness", color: "var(--color-wellness)" },
  { key: "commit", label: "Fixed", color: "var(--color-commit)" },
];

// Fitness and wellness items only appear while wellness tracking is on.
const legend = features.wellnessTracking
  ? allLegend
  : allLegend.filter((entry) => entry.key !== "fitness" && entry.key !== "wellness");

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

// Check-off and acceptance go through the shared /api/mobile/plan/* contract (cookie auth on web).
async function sendPlanRequest<T>(path: string, method: "PUT" | "POST", body: unknown, fallbackError: string): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
      throw new Error(payload.error);
    }
    throw new Error(fallbackError);
  }
  return payload as T;
}

function formatAcceptedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const checkoff = planData?.checkoff;
  const counts = planData ? planCheckoffCounts(planData.plan.items) : null;

  async function handleGeneratePlan() {
    dispatch({ type: "start" });
    try {
      const payload = await requestTodayPlan();
      dispatch({ type: "succeeded", payload });
      captureEvent(analyticsEvents.planGenerated);
    } catch (error) {
      dispatch({
        type: "failed",
        message: error instanceof Error ? error.message : "Unable to generate today plan.",
      });
    }
  }

  async function handleCheckoff(item: PlannedItem, tapped: PlanItemStatus) {
    if (!planData || !checkoff || !item.key) return;
    const key = item.key;
    const previous = item.status ?? null;
    const status = nextPlanItemStatus(previous, tapped);
    setActionError(null);
    setPendingKey(key);
    dispatch({ type: "itemStatus", key, status });
    try {
      await sendPlanRequest<PlanItemStatusResponse>(
        "/api/mobile/plan/status",
        "PUT",
        { planDate: checkoff.planDate, itemKey: key, itemType: item.type, status },
        "Unable to save check-off.",
      );
      if (status) {
        const updated = planCheckoffCounts(applyPlanItemStatus(planData.plan.items, key, status));
        captureEvent(analyticsEvents.planItemCompleted, { item_type: item.type, status, ...updated });
      }
    } catch (error) {
      dispatch({ type: "itemStatus", key, status: previous });
      setActionError(error instanceof Error ? error.message : "Unable to save check-off.");
    } finally {
      setPendingKey(null);
    }
  }

  async function handleAccept() {
    if (!planData || !checkoff) return;
    setActionError(null);
    setAccepting(true);
    try {
      const result = await sendPlanRequest<PlanAcceptResponse>(
        "/api/mobile/plan/accept",
        "POST",
        { planDate: checkoff.planDate, itemCount: planData.plan.items.length },
        "Unable to accept plan.",
      );
      dispatch({ type: "accepted", acceptedAt: result.acceptedAt });
      captureEvent(analyticsEvents.planAccepted, planCheckoffCounts(planData.plan.items));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to accept plan.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Today&apos;s study plan</h2>
          <p className="text-sm text-ink-muted">Study time fitted around your classes, deadlines, and exams.</p>
        </div>
        <button
          className="inline-flex items-center rounded-[11px] bg-teal px-5 py-2.5 font-display text-sm font-medium text-on-teal transition hover:bg-teal-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={handleGeneratePlan}
          type="button"
        >
          {isLoading ? "Planning..." : "Plan my day"}
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
            <StatTile label="Blocks" value={planData.plan.items.length} />
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
            <h3 className="font-display text-lg font-bold tracking-tight text-ink">Today&apos;s plan</h3>
            <div className="flex flex-wrap gap-3">
              {legend.map((entry) => (
                <span className="flex items-center gap-1.5" key={entry.key}>
                  <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ background: entry.color }} />
                  <span className="font-mono text-[11px] text-ink-muted">{entry.label}</span>
                </span>
              ))}
            </div>
          </div>

          {checkoff && counts && counts.item_count > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-line bg-surface2 px-4 py-3">
              <p className="text-sm text-ink">
                <span className="font-semibold">
                  {counts.done_count} of {counts.item_count} done
                </span>
                {counts.skipped_count > 0 ? <span className="text-ink-muted"> · {counts.skipped_count} skipped</span> : null}
                {checkoff.acceptedAt ? (
                  <span className="text-ink-muted"> · Committed at {formatAcceptedAt(checkoff.acceptedAt)}</span>
                ) : null}
              </p>
              {checkoff.acceptedAt ? null : (
                <button
                  className="inline-flex items-center rounded-[11px] border border-teal px-4 py-2 font-display text-sm font-medium text-teal transition hover:bg-teal hover:text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={accepting}
                  onClick={handleAccept}
                  type="button"
                >
                  {accepting ? "Saving..." : "Commit to this plan"}
                </button>
              )}
            </div>
          ) : null}
          {actionError ? (
            <p className="rounded-[11px] border border-danger border-l-[3px] bg-surface px-4 py-3 text-sm text-danger">{actionError}</p>
          ) : null}

          <TodayPlanMeridian
            contextEvents={planData.contextEvents}
            generatedAt={planData.meta.generatedAt}
            items={planData.plan.items}
            onCheckoff={checkoff ? handleCheckoff : undefined}
            pendingKey={pendingKey}
          />
          <p className="text-right font-mono text-[11px] text-ink-muted">Planned {formatGeneratedAt(planData.meta.generatedAt)}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No plan yet. Plan your day to see when to study.</p>
      )}
    </section>
  );
}
