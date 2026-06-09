"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  NaturalLanguageOnboardingDraft,
  NaturalLanguageOnboardingMode,
} from "@/lib/onboarding/natural-language";

type ParseResponse =
  | { draft: NaturalLanguageOnboardingDraft }
  | { error: string };

type ApplyResponse =
  | {
      applied: {
        profileUpdated: boolean;
        goalsCreated: number;
        scheduleBlocksCreated: number;
      };
    }
  | { error: string };

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MODE_COPY: Record<
  NaturalLanguageOnboardingMode,
  {
    title: string;
    description: string;
    placeholder: string;
    parseLabel: string;
  }
> = {
  school_work: {
    title: "Add school and work from text",
    description: "Paste fixed classes, labs, shifts, or work hours.",
    placeholder: "Example: I work Monday to Friday 9-5 and have chemistry lab Tuesday and Thursday 6-8 PM.",
    parseLabel: "Parse school and work",
  },
  weekly_rhythm: {
    title: "Add weekly rhythm from text",
    description: "Paste recurring habits, study blocks, personal plans, and unavailable time.",
    placeholder: "Example: I study Spanish Monday and Wednesday 7-8, go to the gym Saturday morning, and keep Sunday night blocked.",
    parseLabel: "Parse weekly rhythm",
  },
  goals: {
    title: "Add goals from text",
    description: "Paste the outcomes Atlas should plan around.",
    placeholder: "Example: I want to learn Spanish by December, run a half marathon this fall, and save for a car.",
    parseLabel: "Parse goals",
  },
};

function isErrorResponse(value: ParseResponse | ApplyResponse): value is { error: string } {
  return "error" in value;
}

function formatDays(days: number[]) {
  return days.map((day) => dayLabels[day] ?? String(day)).join(", ");
}

function profileEntries(draft: NaturalLanguageOnboardingDraft) {
  return [
    draft.profile.workStartTime && draft.profile.workEndTime
      ? `Work ${draft.profile.workStartTime} - ${draft.profile.workEndTime}`
      : null,
    draft.profile.noMeetingStartTime && draft.profile.noMeetingEndTime
      ? `No meetings ${draft.profile.noMeetingStartTime} - ${draft.profile.noMeetingEndTime}`
      : null,
    draft.profile.focusBlockMinutes ? `${draft.profile.focusBlockMinutes} min focus blocks` : null,
    draft.profile.workoutPreference ? `${draft.profile.workoutPreference} workouts` : null,
  ].filter((entry): entry is string => Boolean(entry));
}

export function NaturalLanguageOnboardingPanel({ mode }: { mode: NaturalLanguageOnboardingMode }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NaturalLanguageOnboardingDraft | null>(null);
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
      const response = await fetch("/api/onboarding/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text, timezone: "America/Toronto" }),
      });
      const payload = (await response.json()) as ParseResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to parse onboarding note.");
      }

      setDraft(payload.draft);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unable to parse onboarding note.");
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
      const response = await fetch("/api/onboarding/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, mode, timezone: "America/Toronto" }),
      });
      const payload = (await response.json()) as ApplyResponse;

      if (!response.ok || isErrorResponse(payload)) {
        throw new Error(isErrorResponse(payload) ? payload.error : "Unable to apply onboarding drafts.");
      }

      setMessage(
        `Saved ${payload.applied.scheduleBlocksCreated} schedule blocks and ${payload.applied.goalsCreated} goals.`,
      );
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Unable to apply onboarding drafts.");
    } finally {
      setIsApplying(false);
    }
  }

  const entries = draft ? profileEntries(draft) : [];
  const showProfile = mode !== "goals";
  const showSchedule = mode !== "goals";
  const showGoals = mode === "goals";
  const hasDraftContent = Boolean(
    draft &&
      ((showProfile && entries.length > 0) ||
        (showSchedule && draft.scheduleBlocks.length > 0) ||
        (showGoals && draft.goals.length > 0)),
  );
  const copy = MODE_COPY[mode];

  return (
    <section className="mb-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{copy.title}</h2>
        <p className="mt-1 text-sm text-zinc-600">{copy.description}</p>
      </div>

      <textarea
        className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
        onChange={(event) => setText(event.target.value)}
        placeholder={copy.placeholder}
        value={text}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isParsing || text.trim().length < 12}
          onClick={handleParse}
          type="button"
        >
          {isParsing ? "Parsing..." : copy.parseLabel}
        </button>
        {draft ? (
          <button
            className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isApplying || !hasDraftContent}
            onClick={handleApply}
            type="button"
          >
            {isApplying ? "Saving..." : "Apply drafts"}
          </button>
        ) : null}
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}

      {draft ? (
        <div className={`grid gap-3 ${showProfile && showSchedule ? "md:grid-cols-2" : ""}`}>
          {showProfile ? (
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Profile</p>
              {entries.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                  {entries.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No profile fields found.</p>
              )}
            </div>
          ) : null}

          {showSchedule ? (
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Schedule</p>
              {draft.scheduleBlocks.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-700">
                  {draft.scheduleBlocks.map((block, index) => (
                    <li key={`${block.title}-${index}`}>
                      <span className="font-medium text-zinc-900">{block.title}</span>
                      <br />
                      {formatDays(block.daysOfWeek)} {block.startTime} - {block.endTime}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No schedule blocks found.</p>
              )}
            </div>
          ) : null}

          {showGoals ? (
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goals</p>
              {draft.goals.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm text-zinc-700">
                  {draft.goals.map((goal, index) => (
                    <li key={`${goal.title}-${index}`}>
                      <span className="font-medium text-zinc-900">{goal.title}</span>
                      <br />
                      Priority {goal.priority}
                      {goal.endDate ? `, by ${goal.endDate}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No goals found.</p>
              )}
            </div>
          ) : null}
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
