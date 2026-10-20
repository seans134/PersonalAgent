import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { formatStudyMinutes, PLAN_ITEM_MINUTES_MAX, type StudySession, type StudySessionStartRequest } from "@personal-agent/core";
import {
  discardStudySession,
  fetchCurrentStudySession,
  setMobilePlanItemStatus,
  startStudySession,
  StudySessionRequestError,
  stopStudySession,
} from "./api";
import { errorHaptic, successHaptic, tapHaptic } from "./haptics";

// App-wide study timer. The server owns the running session (started_at), so the timer survives
// the app being closed; this provider mirrors it, re-reading it whenever the app comes back.

/** A Today study block a stopped session came from, offered to be marked done with its real minutes. */
export type StudyBlockOffer = { planDate: string; itemKey: string; minutes: number };

/** Today registers this so marking a block done updates the plan on screen. Returns false when it can't. */
export type StudyBlockDoneHandler = (offer: StudyBlockOffer) => Promise<boolean>;

type StudyTimerContextValue = {
  running: StudySession | null;
  busy: boolean;
  notice: string | null;
  start: (input: StudySessionStartRequest) => Promise<boolean>;
  stop: () => Promise<void>;
  discard: () => void;
  dismissNotice: () => void;
  /** Called after a session is saved, so screens showing study totals can reload. */
  onSessionsChanged: (listener: () => void) => () => void;
  registerBlockDoneHandler: (handler: StudyBlockDoneHandler | null) => void;
};

const StudyTimerContext = createContext<StudyTimerContextValue>({
  running: null,
  busy: false,
  notice: null,
  start: async () => false,
  stop: async () => {},
  discard: () => {},
  dismissNotice: () => {},
  onSessionsChanged: () => () => {},
  registerBlockDoneHandler: () => {},
});

export function useStudyTimer() {
  return useContext(StudyTimerContext);
}

const AUTO_STOP_TEXT = "Your timer ran for over 6 hours, so it was stopped and saved at 6 h.";

export function StudyTimerProvider({ accessToken, children }: { accessToken: string; children: React.ReactNode }) {
  const [running, setRunning] = useState<StudySession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busyRef = useRef(false);
  const blockDoneHandlerRef = useRef<StudyBlockDoneHandler | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  const notifyChanged = useCallback(() => {
    for (const listener of listenersRef.current) listener();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const current = await fetchCurrentStudySession(accessToken);
      setRunning(current.running);
      if (current.autoStopped) {
        setNotice(AUTO_STOP_TEXT);
        notifyChanged();
      }
    } catch {
      // Offline: keep what's shown; the next foreground retries.
    }
  }, [accessToken, notifyChanged]);

  useEffect(() => {
    const timeout = setTimeout(() => void refresh(), 0);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [refresh]);

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
          setRunning(await startStudySession(accessToken, input));
          tapHaptic();
          started = true;
        } catch (error) {
          errorHaptic();
          if (error instanceof StudySessionRequestError && error.running) setRunning(error.running);
          setNotice(error instanceof Error ? error.message : "Unable to start the timer.");
        }
      });
      return started;
    },
    [accessToken, withBusy],
  );

  const markBlockDone = useCallback(
    async (offer: StudyBlockOffer) => {
      try {
        const handled = blockDoneHandlerRef.current ? await blockDoneHandlerRef.current(offer) : false;
        if (!handled) {
          await setMobilePlanItemStatus(
            accessToken,
            { planDate: offer.planDate, itemKey: offer.itemKey, itemType: "study", status: "done", minutes: offer.minutes > 0 ? offer.minutes : null },
            null,
          );
        }
        successHaptic();
        setNotice("Study block marked done.");
      } catch (error) {
        errorHaptic();
        setNotice(error instanceof Error ? error.message : "Unable to mark the block done.");
      }
    },
    [accessToken],
  );

  const stop = useCallback(async () => {
    const session = running;
    if (!session) return;
    await withBusy(async () => {
      try {
        const result = await stopStudySession(accessToken, session.id);
        setRunning(null);
        notifyChanged();
        if (result.discarded || !result.session) {
          setNotice("Under a minute, so it wasn't saved.");
          return;
        }
        successHaptic();
        const saved = result.session;
        const minutes = saved.durationMinutes ?? 0;
        setNotice(
          saved.autoStopped
            ? AUTO_STOP_TEXT
            : `Saved ${formatStudyMinutes(minutes)}${saved.courseName ? ` of ${saved.courseName}` : " of study time"}.`,
        );
        const { planItemKey, planDate } = saved;
        if (planItemKey && planDate) {
          const offer = { planDate, itemKey: planItemKey, minutes: Math.min(minutes, PLAN_ITEM_MINUTES_MAX) };
          Alert.alert("Mark this study block done?", `You studied ${formatStudyMinutes(minutes)}.`, [
            { text: "Not now", style: "cancel" },
            { text: "Mark done", onPress: () => void markBlockDone(offer) },
          ]);
        }
      } catch (error) {
        errorHaptic();
        setNotice(error instanceof Error ? error.message : "Unable to stop the timer.");
        void refresh();
      }
    });
  }, [accessToken, markBlockDone, notifyChanged, refresh, running, withBusy]);

  const discard = useCallback(() => {
    const session = running;
    if (!session) return;
    Alert.alert("Discard this timer?", "The time won't be saved.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () =>
          void withBusy(async () => {
            try {
              await discardStudySession(accessToken, session.id);
              setRunning(null);
              setNotice("Timer discarded.");
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "Unable to discard the timer.");
              void refresh();
            }
          }),
      },
    ]);
  }, [accessToken, refresh, running, withBusy]);

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
      running,
      busy,
      notice,
      start,
      stop,
      discard,
      dismissNotice: () => setNotice(null),
      onSessionsChanged,
      registerBlockDoneHandler,
    }),
    [busy, discard, notice, onSessionsChanged, registerBlockDoneHandler, running, start, stop],
  );

  return <StudyTimerContext.Provider value={value}>{children}</StudyTimerContext.Provider>;
}
