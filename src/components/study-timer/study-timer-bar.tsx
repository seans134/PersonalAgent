"use client";

import { useEffect, useState } from "react";
import { formatStudyTimer, studyTimerElapsedMs, type StudySessionStartRequest } from "@personal-agent/core";
import { useStudyTimer } from "./study-timer-provider";

function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);
  return (
    <span className="font-mono text-lg font-bold tabular-nums text-ink" aria-live="off">
      {now === null ? "--:--" : formatStudyTimer(studyTimerElapsedMs(startedAt, now))}
    </span>
  );
}

const barButton =
  "rounded-[10px] border px-3 py-1.5 font-display text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

/** The running timer, plus what happened to the last one. Sticks to the bottom of every page. */
export function StudyTimerBar() {
  const { enabled, running, busy, notice, blockOffer, stop, discard, dismissNotice, markBlockDone, dismissBlockOffer } =
    useStudyTimer();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (!enabled || (!running && !notice && !blockOffer)) return null;

  return (
    <div className="sticky bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur" role="region" aria-label="Study timer">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        {running ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-teal" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-teal">Studying</p>
                <p className="truncate text-sm font-semibold text-ink">{running.courseName ?? "General study"}</p>
              </div>
              <ElapsedClock startedAt={running.startedAt} />
            </div>
            <div className="flex gap-2">
              {confirmingDiscard ? (
                <>
                  <button
                    className={`${barButton} border-danger text-danger hover:bg-danger hover:text-on-status`}
                    disabled={busy}
                    onClick={() => {
                      setConfirmingDiscard(false);
                      void discard();
                    }}
                    type="button"
                  >
                    Discard time
                  </button>
                  <button className={`${barButton} border-line text-ink-muted hover:text-ink`} onClick={() => setConfirmingDiscard(false)} type="button">
                    Keep going
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`${barButton} border-teal bg-teal text-on-teal hover:bg-teal-strong`}
                    disabled={busy}
                    onClick={() => void stop()}
                    type="button"
                  >
                    {busy ? "Saving..." : "Stop"}
                  </button>
                  <button
                    className={`${barButton} border-line text-ink-muted hover:text-ink`}
                    disabled={busy}
                    onClick={() => setConfirmingDiscard(true)}
                    type="button"
                  >
                    Discard
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm ${notice.tone === "error" ? "text-danger" : "text-ink"}`}>{notice.text}</p>
            <button className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted hover:text-ink" onClick={dismissNotice} type="button">
              Dismiss
            </button>
          </div>
        ) : null}

        {blockOffer ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-line bg-surface2 px-3 py-2">
            <p className="text-sm text-ink">Mark this study block done with the time you studied?</p>
            <div className="flex gap-2">
              <button
                className={`${barButton} border-teal text-teal hover:bg-teal hover:text-on-teal`}
                disabled={busy}
                onClick={() => void markBlockDone()}
                type="button"
              >
                Mark done
              </button>
              <button className={`${barButton} border-line text-ink-muted hover:text-ink`} onClick={dismissBlockOffer} type="button">
                Not now
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Starts the study timer for a course, a course item (exam card), or a Today study block.
 * While a timer runs it shows that instead, so a second timer can't be started.
 */
export function StartStudyButton({
  target,
  label = "Start studying",
  className = "",
}: {
  target: StudySessionStartRequest;
  label?: string;
  className?: string;
}) {
  const { enabled, running, busy, start } = useStudyTimer();
  if (!enabled) return null;

  const isThis =
    running !== null &&
    (target.planItemKey
      ? running.planItemKey === target.planItemKey
      : target.courseItemId
        ? running.courseItemId === target.courseItemId && !running.planItemKey
        : running.courseId === (target.courseId ?? null) && !running.courseItemId);
  const text = isThis ? "Studying now" : running ? "Timer running" : label;

  return (
    <button
      className={`rounded-[8px] border px-2.5 py-1 font-mono text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isThis ? "border-teal bg-teal text-on-teal" : "border-teal bg-surface text-teal hover:bg-teal hover:text-on-teal"
      } ${className}`}
      disabled={busy || running !== null}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void start(target);
      }}
      title={running && !isThis ? "Stop the running timer first." : undefined}
      type="button"
    >
      {text}
    </button>
  );
}
