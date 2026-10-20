"use client";

import { useCallback, useEffect, useState } from "react";
import {
  analyticsEvents,
  formatStudyMinutes,
  localPlanDate,
  parseStudyMinutesInput,
  STUDY_MANUAL_LOOKBACK_DAYS,
  STUDY_SESSION_MAX_MINUTES,
  studyDayLabel,
  studyMinutesBucket,
  type StudySessionManualResponse,
  type StudySummary,
} from "@personal-agent/core";
import { shiftDate } from "@personal-agent/core/calendar";
import { useStudyTimer } from "@/components/study-timer/study-timer-provider";
import { captureEvent } from "@/lib/analytics";

type CourseOption = { id: string; name: string };

const inputClass =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none";
const primaryButton =
  "inline-flex items-center justify-center rounded-[11px] bg-teal px-4 py-2 font-display text-sm font-medium text-on-teal transition hover:bg-teal-strong disabled:cursor-not-allowed disabled:opacity-60";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface2 px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-teal">{value}</p>
    </div>
  );
}

function SevenDayBars({ days }: { days: StudySummary["last7Days"] }) {
  const max = Math.max(...days.map((day) => day.minutes), 1);
  return (
    <div aria-label="Study minutes for the last 7 days" className="flex h-36 items-end gap-2" role="img">
      {days.map((day) => (
        <div className="flex h-full flex-1 flex-col items-center justify-end gap-1" key={day.date} title={`${day.date}: ${formatStudyMinutes(day.minutes)}`}>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">{day.minutes > 0 ? day.minutes : ""}</span>
          <div
            className={`w-full rounded-t-[6px] ${day.minutes > 0 ? "bg-teal" : "bg-line"}`}
            style={{ height: `${day.minutes > 0 ? Math.max(6, (day.minutes / max) * 100) : 3}%` }}
          />
          <span className="font-mono text-[11px] text-ink-muted">{studyDayLabel(day.date)}</span>
        </div>
      ))}
    </div>
  );
}

/** The Insights "Study time" section: week by course, 7-day bars, streak, a standalone timer and manual logging. */
export function StudyTimePanel({ courses, initialSummary }: { courses: CourseOption[]; initialSummary: StudySummary | null }) {
  const { running, busy, start, onSessionsChanged } = useStudyTimer();
  const [summary, setSummary] = useState(initialSummary);
  const [timerCourseId, setTimerCourseId] = useState(courses[0]?.id ?? "");
  const today = summary?.today ?? localPlanDate();
  const [logCourseId, setLogCourseId] = useState(courses[0]?.id ?? "");
  const [logDate, setLogDate] = useState(today);
  const [logMinutes, setLogMinutes] = useState("");
  const [logging, setLogging] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/mobile/study-sessions/summary");
      if (response.ok) setSummary((await response.json()) as StudySummary);
    } catch {
      // Keep the numbers shown.
    }
  }, []);

  useEffect(() => onSessionsChanged(() => void reload()), [onSessionsChanged, reload]);

  async function handleLog(event: React.FormEvent) {
    event.preventDefault();
    const minutes = parseStudyMinutesInput(logMinutes);
    if (minutes === null) {
      setMessage({ tone: "error", text: `Enter whole minutes from 1 to ${STUDY_SESSION_MAX_MINUTES}.` });
      return;
    }
    setLogging(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/study-sessions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: logCourseId || null, date: logDate, minutes }),
      });
      const payload = (await response.json().catch(() => null)) as (StudySessionManualResponse & { error?: string }) | null;
      if (!response.ok || !payload?.session) throw new Error(payload?.error ?? "Unable to log study time.");
      captureEvent(analyticsEvents.studySessionCompleted, { minutes_bucket: studyMinutesBucket(minutes), source: "manual" });
      setLogMinutes("");
      setMessage({ tone: "info", text: `Logged ${formatStudyMinutes(minutes)}.` });
      await reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to log study time." });
    } finally {
      setLogging(false);
    }
  }

  const courseOptions = (
    <>
      {courses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      ))}
      <option value="">No course</option>
    </>
  );

  return (
    <section className="space-y-6 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">Study time</h2>
        <p className="text-sm text-ink-muted">From the study timer and time you log yourself. Weeks start Monday.</p>
      </div>

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="This week" value={formatStudyMinutes(summary.weekTotalMinutes)} />
            <Stat label="Today" value={formatStudyMinutes(summary.todayMinutes)} />
            <Stat label="Study streak" value={`${summary.streakDays} ${summary.streakDays === 1 ? "day" : "days"}`} />
          </div>

          <div>
            <h3 className="mb-3 font-display text-base font-semibold text-ink">Last 7 days</h3>
            <SevenDayBars days={summary.last7Days} />
          </div>

          <div>
            <h3 className="mb-3 font-display text-base font-semibold text-ink">This week by course</h3>
            {summary.weekByCourse.length > 0 ? (
              <ul className="space-y-2">
                {summary.weekByCourse.map((entry) => (
                  <li className="space-y-1" key={entry.courseId ?? "none"}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate text-ink">{entry.courseName ?? "No course"}</span>
                      <span className="shrink-0 font-mono text-ink-muted">{formatStudyMinutes(entry.minutes)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface2">
                      <div
                        className="h-2 rounded-full bg-teal"
                        style={{ width: `${(entry.minutes / Math.max(summary.weekByCourse[0].minutes, 1)) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No study time yet this week. Start a timer or log time below.</p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Study time couldn&apos;t load right now.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-[12px] border border-line bg-surface2 p-4">
          <h3 className="font-display text-base font-semibold text-ink">Start a timer</h3>
          <label className="block text-sm text-ink-muted">
            Course
            <select className={`${inputClass} mt-1`} onChange={(event) => setTimerCourseId(event.target.value)} value={timerCourseId}>
              {courseOptions}
            </select>
          </label>
          <button
            className={primaryButton}
            disabled={busy || running !== null}
            onClick={() => void start({ courseId: timerCourseId || null })}
            type="button"
          >
            {running ? "Timer running" : "Start studying"}
          </button>
        </div>

        <form className="space-y-3 rounded-[12px] border border-line bg-surface2 p-4" onSubmit={handleLog}>
          <h3 className="font-display text-base font-semibold text-ink">Log study time</h3>
          <label className="block text-sm text-ink-muted">
            Course
            <select className={`${inputClass} mt-1`} onChange={(event) => setLogCourseId(event.target.value)} value={logCourseId}>
              {courseOptions}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-ink-muted">
              Date
              <input
                className={`${inputClass} mt-1`}
                max={today}
                min={shiftDate(today, -STUDY_MANUAL_LOOKBACK_DAYS)}
                onChange={(event) => setLogDate(event.target.value)}
                required
                type="date"
                value={logDate}
              />
            </label>
            <label className="block text-sm text-ink-muted">
              Minutes
              <input
                className={`${inputClass} mt-1`}
                inputMode="numeric"
                max={STUDY_SESSION_MAX_MINUTES}
                min={1}
                onChange={(event) => setLogMinutes(event.target.value)}
                placeholder="45"
                required
                type="number"
                value={logMinutes}
              />
            </label>
          </div>
          <button className={primaryButton} disabled={logging} type="submit">
            {logging ? "Saving..." : "Log time"}
          </button>
        </form>
      </div>

      {message ? <p className={`text-sm ${message.tone === "error" ? "text-danger" : "text-ink"}`}>{message.text}</p> : null}
    </section>
  );
}
