"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  analyticsEvents,
  formatStudyMinutes,
  PLAN_ITEM_MINUTES_MAX,
  studyMinutesBucket,
  type PlanItemStatusResponse,
  type StudySession,
  type StudySessionCurrentResponse,
  type StudySessionStartRequest,
  type StudySessionStartResponse,
  type StudySessionStopResponse,
} from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

// App-wide study timer for the web app. The server owns the running session (started_at), so
// the timer survives reloads and closed tabs; this provider only mirrors it and renders elapsed
// time. Uses the shared /api/mobile/study-sessions/* contract with cookie auth.

/** A Today study block the stopped session came from, offered to be marked done with its real minutes. */
export type StudyBlockOffer = { planDate: string; itemKey: string; minutes: number; courseName: string | null };

/** Today's plan registers this so marking a block done from the timer updates the plan on screen. Returns false when it can't. */
export type StudyBlockDoneHandler = (offer: StudyBlockOffer) => Promise<boolean>;

export type StudyTimerNotice = { tone: "info" | "error"; text: string };

type StudyTimerContextValue = {
  enabled: boolean;
  running: StudySession | null;
  busy: boolean;
  notice: StudyTimerNotice | null;
  blockOffer: StudyBlockOffer | null;
  start: (input: StudySessionStartRequest) => Promise<boolean>;
  stop: () => Promise<void>;
  discard: () => Promise<void>;
  refresh: () => Promise<void>;
  dismissNotice: () => void;
  markBlockDone: () => Promise<void>;
  dismissBlockOffer: () => void;
  /** Called after a session is saved or discarded, so screens showing study totals can reload. */
  onSessionsChanged: (listener: () => void) => () => void;
  registerBlockDoneHandler: (handler: StudyBlockDoneHandler | null) => void;
};

const noop = async () => {};

const StudyTimerContext = createContext<StudyTimerContextValue>({
  enabled: false,
  running: null,
  busy: false,
  notice: null,
  blockOffer: null,
  start: async () => false,
  stop: noop,
  discard: noop,
  refresh: noop,
  dismissNotice: () => {},
  markBlockDone: noop,
  dismissBlockOffer: () => {},
  onSessionsChanged: () => () => {},
  registerBlockDoneHandler: () => {},
});

export function useStudyTimer() {
  return useContext(StudyTimerContext);
}

class StudyRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly running: StudySession | null,
  ) {
    super(message);
  }
}

async function studyRequest<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: unknown; running?: StudySession } | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "Something went wrong. Try again.";
    throw new StudyRequestError(response.status, message, payload?.running ?? null);
  }
  return payload as T;
}

function savedSessionText(session: StudySession): string {
  const length = formatStudyMinutes(session.durationMinutes ?? 0);
  return session.courseName ? `Saved ${length} of ${session.courseName}.` : `Saved ${length} of study time.`;
}

const AUTO_STOP_TEXT = "Your timer ran for over 6 hours, so it was stopped and saved at 6 h.";

export function StudyTimerProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [running, setRunning] = useState<StudySession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StudyTimerNotice | null>(null);
  const [blockOffer, setBlockOffer] = useState<StudyBlockOffer | null>(null);
  const busyRef = useRef(false);
  const blockDoneHandlerRef = useRef<StudyBlockDoneHandler | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  const notifyChanged = useCallback(() => {
    for (const listener of listenersRef.current) listener();
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const current = await studyRequest<StudySessionCurrentResponse>("/api/mobile/study-sessions/current", "GET");
      setRunning(current.running);
      if (current.autoStopped) {
        setNotice({ tone: "info", text: AUTO_STOP_TEXT });
        notifyChanged();
      }
    } catch {
      // Keep what's shown; the next focus retries.
    }
  }, [enabled, notifyChanged]);

  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => void refresh(), 0);
    // Another tab or the phone may have started or stopped the timer meanwhile.
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  /** Runs one timer action at a time. */
  const withBusy = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const start = useCallback(
    async (input: StudySessionStartRequest) => {
      let started = false;
      await withBusy(async () => {
        setNotice(null);
        try {
          const result = await studyRequest<StudySessionStartResponse>("/api/mobile/study-sessions", "POST", input);
          setRunning(result.session);
          setBlockOffer(null);
          started = true;
        } catch (error) {
          if (error instanceof StudyRequestError && error.running) setRunning(error.running);
          setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to start the timer." });
        }
      });
      return started;
    },
    [withBusy],
  );

  const stop = useCallback(async () => {
    const session = running;
    if (!session) return;
    await withBusy(async () => {
      try {
        const result = await studyRequest<StudySessionStopResponse>(`/api/mobile/study-sessions/${session.id}/stop`, "POST");
        setRunning(null);
        if (result.discarded || !result.session) {
          setNotice({ tone: "info", text: "Under a minute, so it wasn't saved." });
        } else {
          const saved = result.session;
          const minutes = saved.durationMinutes ?? 0;
          captureEvent(analyticsEvents.studySessionCompleted, { minutes_bucket: studyMinutesBucket(minutes), source: saved.source });
          setNotice({ tone: "info", text: saved.autoStopped ? AUTO_STOP_TEXT : savedSessionText(saved) });
          if (saved.planItemKey && saved.planDate) {
            setBlockOffer({
              planDate: saved.planDate,
              itemKey: saved.planItemKey,
              minutes: Math.min(minutes, PLAN_ITEM_MINUTES_MAX),
              courseName: saved.courseName,
            });
          }
        }
        notifyChanged();
      } catch (error) {
        if (error instanceof StudyRequestError && error.status === 404) setRunning(null);
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to stop the timer." });
      }
    });
  }, [notifyChanged, running, withBusy]);

  const discard = useCallback(async () => {
    const session = running;
    if (!session) return;
    await withBusy(async () => {
      try {
        await studyRequest<{ ok: true }>(`/api/mobile/study-sessions/${session.id}`, "DELETE");
        setRunning(null);
        setNotice({ tone: "info", text: "Timer discarded." });
      } catch (error) {
        if (error instanceof StudyRequestError && error.status === 404) setRunning(null);
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to discard the timer." });
      }
    });
  }, [running, withBusy]);

  const markBlockDone = useCallback(async () => {
    const offer = blockOffer;
    if (!offer) return;
    await withBusy(async () => {
      try {
        // Today's plan on screen marks it through its own check-off (keeping its counts and analytics).
        const handled = blockDoneHandlerRef.current ? await blockDoneHandlerRef.current(offer) : false;
        if (!handled) {
          await studyRequest<PlanItemStatusResponse>("/api/mobile/plan/status", "PUT", {
            planDate: offer.planDate,
            itemKey: offer.itemKey,
            itemType: "study",
            status: "done",
            minutes: offer.minutes > 0 ? offer.minutes : null,
          });
        }
        setBlockOffer(null);
        setNotice({ tone: "info", text: "Study block marked done." });
      } catch (error) {
        setNotice({ tone: "error", text: error instanceof Error ? error.message : "Unable to mark the block done." });
      }
    });
  }, [blockOffer, withBusy]);

  const onSessionsChanged = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerBlockDoneHandler = useCallback((handler: StudyBlockDoneHandler | null) => {
    blockDoneHandlerRef.current = handler;
  }, []);

  const value = useMemo<StudyTimerContextValue>(
    () => ({
      enabled,
      running,
      busy,
      notice,
      blockOffer,
      start,
      stop,
      discard,
      refresh,
      dismissNotice: () => setNotice(null),
      markBlockDone,
      dismissBlockOffer: () => setBlockOffer(null),
      onSessionsChanged,
      registerBlockDoneHandler,
    }),
    [blockOffer, busy, discard, enabled, markBlockDone, notice, onSessionsChanged, refresh, registerBlockDoneHandler, running, start, stop],
  );

  return <StudyTimerContext.Provider value={value}>{children}</StudyTimerContext.Provider>;
}
