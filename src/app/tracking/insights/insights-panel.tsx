"use client";

import { useCallback, useEffect, useState } from "react";
import type { HabitDigest, HabitMetrics, HabitPeriod, Nudge } from "@personal-agent/core";

type HabitReport = {
  period: HabitPeriod;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: HabitMetrics;
  nudges: Nudge[];
  digest: HabitDigest;
  source: string;
};

type ReportResponse = { report: HabitReport } | { error: string };

const PERIODS: { id: HabitPeriod; label: string }[] = [
  { id: "daily", label: "Daily digest" },
  { id: "weekly", label: "Weekly review" },
];

function deviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatValue(value: number | null, suffix = "") {
  return value === null ? "—" : `${Number(value).toLocaleString()}${suffix}`;
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export function InsightsPanel() {
  const [period, setPeriod] = useState<HabitPeriod>("daily");
  const [reports, setReports] = useState<Partial<Record<HabitPeriod, HabitReport>>>({});
  const [loading, setLoading] = useState<Partial<Record<HabitPeriod, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target: HabitPeriod, refresh = false) => {
    setLoading((prev) => ({ ...prev, [target]: true }));
    setError(null);
    try {
      const response = await fetch("/api/tracking/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: target,
          referenceDate: localDate(),
          timezone: deviceTimezone(),
          refresh,
        }),
      });
      const data = (await response.json()) as ReportResponse;
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Unable to load insights.");
      }
      setReports((prev) => ({ ...prev, [target]: data.report }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load insights.");
    } finally {
      setLoading((prev) => ({ ...prev, [target]: false }));
    }
  }, []);

  useEffect(() => {
    void load("daily");
    void load("weekly");
  }, [load]);

  const report = reports[period];
  const isLoading = loading[period] ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((option) => {
          const active = option.id === period;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={
                active
                  ? "rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal"
                  : "rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
              }
            >
              {option.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void load(period, true)}
          disabled={isLoading}
          className="ml-auto rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-60"
        >
          {isLoading ? "Working…" : "Regenerate"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger bg-surface px-4 py-3 text-sm text-danger">{error}</p>
      ) : null}

      {!report && isLoading ? (
        <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-muted">Analyzing your habits…</p>
      ) : null}

      {report ? <ReportView report={report} loading={isLoading} /> : null}
    </div>
  );
}

function ReportView({ report, loading }: { report: HabitReport; loading: boolean }) {
  const { digest, metrics } = report;

  return (
    <div className={loading ? "space-y-6 opacity-60" : "space-y-6"}>
      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-ink">{digest.headline}</h2>
        <p className="mt-2 text-ink-muted">{digest.summary}</p>

        {digest.endorsements.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Going well</p>
            <ul className="space-y-2">
              {digest.endorsements.map((endorsement, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-line bg-surface2 px-4 py-3 text-sm text-ink"
                >
                  <span className="mr-2 text-success">✓</span>
                  {endorsement}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {digest.improvements.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Worth a look</p>
            <ul className="space-y-2">
              {digest.improvements.map((improvement, index) => (
                <li key={index} className="rounded-lg border border-line bg-surface2 px-4 py-3 text-sm text-ink">
                  <span className="mr-2 font-medium text-warning">{improvement.area}:</span>
                  {improvement.suggestion}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">The numbers</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Logging streak" value={`${metrics.streaks.loggingStreak}d`} />
          <StatCard label="Workout streak" value={`${metrics.streaks.workoutStreak}d`} />
          <StatCard label="Days logged" value={`${metrics.nutrition.daysLogged}/${metrics.range.days}`} />
          <StatCard label="Workouts" value={String(metrics.workouts.sessions)} />
          <StatCard label="Avg calories" value={formatValue(metrics.nutrition.avgCalories)} />
          <StatCard label="Avg protein" value={formatValue(metrics.nutrition.avgProtein, "g")} />
          <StatCard label="Active minutes" value={String(metrics.workouts.activeMinutes)} />
          <StatCard
            label="Since last workout"
            value={metrics.workouts.daysSinceLastWorkout === null ? "—" : `${metrics.workouts.daysSinceLastWorkout}d`}
          />
        </div>
      </section>

      <p className="text-xs text-ink-muted">
        {report.source === "deterministic" ? "Generated from your logs" : "Generated with your logs"} ·{" "}
        {formatGeneratedAt(report.generatedAt)}
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
