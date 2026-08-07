"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { WorkoutSuggestionDraft } from "@/lib/tracking/workout-suggestions";

type SuggestResponse = { agent_reply: string; draft: WorkoutSuggestionDraft | null; warnings: string[] } | { error: string };
type ApplyResponse = { applied: { workoutsCreated?: number } } | { error: string };
type ChatMessage = { id: string; role: "agent" | "user"; text: string };

const ACCEPT_PATTERNS = [/^ok(ay)?$/i, /^yes$/i, /^yep$/i, /^sure$/i, /^log it$/i, /^track it$/i, /^do it$/i, /^sounds good$/i];

function isErrorResponse(value: SuggestResponse | ApplyResponse): value is { error: string } {
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAcceptIntent(value: string) {
  const normalized = value.trim();
  return ACCEPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getDeviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

function getDeviceTimeContext() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");

  return {
    currentIso: now.toISOString(),
    currentLocalDate: `${year}-${month}-${day}`,
    currentLocalTime: `${hours}:${minutes}`,
    todayEndIso: todayEnd.toISOString(),
    todayStartIso: todayStart.toISOString(),
    timezone: getDeviceTimezone(),
  };
}

function buildAgentWorkoutMessage(draft: WorkoutSuggestionDraft) {
  if (draft.agent_reply) {
    return draft.agent_reply;
  }

  const timing = draft.suggested_timing ? ` ${draft.suggested_timing}.` : "";
  return `I think ${draft.title} is the move today.${timing} It is ${draft.duration_minutes} minutes at ${draft.intensity} intensity. ${draft.suggestion_reason}`;
}

export function WorkoutSuggestionPanel() {
  const router = useRouter();
  const requestedInitialSuggestion = useRef(false);
  const [draft, setDraft] = useState<WorkoutSuggestionDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (requestedInitialSuggestion.current) return;
    requestedInitialSuggestion.current = true;
    void requestSuggestion();
  }, []);

  async function requestSuggestion(options: { currentDraft?: WorkoutSuggestionDraft | null; feedback?: string; userMessage?: string } = {}) {
    setError("");
    setMessage("");
    if (!options.currentDraft) {
      setDraft(null);
    }
    setWarnings([]);
    setIsSuggesting(true);

    try {
      const response = await fetch("/api/tracking/workouts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentDraft: options.currentDraft ?? null,
          feedback: options.feedback ?? null,
          ...getDeviceTimeContext(),
        }),
      });
      const payload = (await response.json()) as SuggestResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to suggest a workout.");
      }

      setDraft(payload.draft);
      setWarnings([...payload.warnings, ...(payload.draft?.warnings ?? [])]);
      setInput("");
      setMessages((current) => [
        ...current,
        ...(options.userMessage ? [{ id: makeId(), role: "user" as const, text: options.userMessage }] : []),
        { id: makeId(), role: "agent" as const, text: payload.draft ? buildAgentWorkoutMessage(payload.draft) : payload.agent_reply },
      ]);
    } catch (suggestError) {
      setError(suggestError instanceof Error ? suggestError.message : "Unable to suggest a workout.");
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleApply(userText?: string) {
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
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to log suggested workout.");
      }

      setMessage("Suggested workout logged.");
      setMessages((current) => [
        ...current,
        ...(userText ? [{ id: makeId(), role: "user" as const, text: userText }] : []),
        { id: makeId(), role: "agent" as const, text: `Done. I logged ${draft.title}.` },
      ]);
      setDraft(null);
      setWarnings([]);
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to log suggested workout.");
    } finally {
      setIsApplying(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSuggesting || isApplying) return;

    if (draft && isAcceptIntent(text)) {
      setInput("");
      await handleApply(text);
      return;
    }

    await requestSuggestion({
      currentDraft: draft,
      feedback: text,
      userMessage: text,
    });
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
        <div>
          <h2 className="text-lg font-semibold text-ink">Atlas workout chat</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Tell Atlas how you feel, ask for alternatives, or say okay to log the current suggestion.
          </p>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}
      {message ? <p className="rounded-lg border border-success bg-surface2 px-3 py-2 text-sm text-success">{message}</p> : null}

      <div className="space-y-3">
        {messages.length === 0 && isSuggesting ? (
          <p className="rounded-lg bg-surface2 px-4 py-3 text-sm text-ink-muted">Atlas is checking your goals, workouts, meals, and calendar...</p>
        ) : null}
        {messages.map((chatMessage) => (
          <p
            className={
              chatMessage.role === "agent"
                ? "max-w-[85%] rounded-lg bg-surface2 px-4 py-3 text-sm text-ink"
                : "ml-auto max-w-[85%] rounded-lg bg-teal px-4 py-3 text-sm text-on-teal"
            }
            key={chatMessage.id}
          >
            {chatMessage.text}
          </p>
        ))}
      </div>

      {draft ? (
        <div className="rounded-lg bg-surface2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{draft.title}</p>
              <p className="mt-1 text-sm text-ink-muted">
                {formatLoggedAt(draft.logged_at)} - {label(draft.workout_type)} - {label(draft.tracking_method)}
              </p>
              {draft.suggested_timing ? <p className="mt-1 text-sm text-ink-muted">{draft.suggested_timing}</p> : null}
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
          <p className="mt-3 text-sm text-ink-muted">{draft.suggestion_reason}</p>
          {draft.target_alignment ? <p className="mt-2 text-sm text-ink-muted">{draft.target_alignment}</p> : null}
          {draft.notes ? <p className="mt-2 text-sm text-ink-muted">{draft.notes}</p> : null}
        </div>
      ) : null}

      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          disabled={isSuggesting || isApplying}
          onChange={(event) => setInput(event.target.value)}
          placeholder={draft ? "Say okay to log it, or ask for a change..." : "Tell Atlas how you feel today..."}
          value={input}
        />
        <button
          className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSuggesting || isApplying || input.trim().length === 0}
          type="submit"
        >
          {isApplying ? "Logging..." : isSuggesting ? "Thinking..." : "Send"}
        </button>
      </form>

      {warnings.length ? (
        <div className="rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-warning">
          <p className="font-medium">Context notes</p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
