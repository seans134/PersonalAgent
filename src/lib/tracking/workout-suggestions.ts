import { isGeminiConfigured, requestWorkoutSuggestion } from "@/lib/gemini/client";
import { validateNaturalLanguageWorkoutDraft, type NaturalLanguageWorkoutDraft } from "./natural-language-workout";

export type WorkoutSuggestionContext = {
  timezone: string;
  today: string;
  currentTimeContext: unknown;
  profile: unknown;
  latestBodyProfile: unknown;
  fitnessContext: unknown;
  goals: unknown[];
  todayWorkouts: unknown[];
  recentWorkouts: unknown[];
  plannedWorkouts: unknown[];
  todayMeals: unknown[];
  nutritionContext: unknown;
  todayEvents: unknown[];
  currentSuggestion?: unknown;
  userFeedback?: string | null;
};

export type WorkoutSuggestionDraft = NaturalLanguageWorkoutDraft & {
  suggestion_reason: string;
  suggested_timing: string | null;
  target_alignment: string | null;
  agent_reply: string | null;
};

export type WorkoutSuggestionResult = {
  agent_reply: string;
  draft: WorkoutSuggestionDraft | null;
  warnings: string[];
};

export type SuggestWorkoutInput = WorkoutSuggestionContext & {
  generateOutput?: (input: WorkoutSuggestionContext) => Promise<unknown>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SAFE_WORKOUT_REPLY =
  "I would skip adding another workout right now. Recovery is the better move here: hydrate, eat normally, and listen to your body before training again.";
const UNSAFE_WORKOUT_MESSAGE = "Workout suggestion skipped due to unsafe content.";

function hasUnprotectedPhrase(text: string, pattern: RegExp): boolean {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes("i") ? "gi" : "g");
  const protectedBefore = /(do not|don't|never|avoid|should not|shouldn't)\s+(?:\w+\s+){0,4}$/i;
  let match = globalPattern.exec(text);

  while (match) {
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    if (!protectedBefore.test(before)) {
      return true;
    }

    match = globalPattern.exec(text);
  }

  return false;
}

function containsUnsafeLanguage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  const unsafePhrases = [
    /no rest/i,
    /skip sleep/i,
    /overtrain/i,
    /extreme (exercise|workout|training)/i,
    /guaranteed (fat loss|muscle|performance)/i,
  ];

  if (unsafePhrases.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (hasUnprotectedPhrase(normalized, /ignore pain/i) || hasUnprotectedPhrase(normalized, /push through pain/i)) {
    return true;
  }

  const harmfulMotivation = [/(?:use|feel|create|add)\s+(?:\w+\s+){0,3}shame/i, /(?:use|feel|create|add)\s+(?:\w+\s+){0,3}guilt/i];
  return harmfulMotivation.some((pattern) => pattern.test(normalized));
}

function safeWorkoutResult(): WorkoutSuggestionResult {
  return {
    agent_reply: SAFE_WORKOUT_REPLY,
    draft: null,
    warnings: [],
  };
}

export function validateWorkoutSuggestionDraft(value: unknown): WorkoutSuggestionDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Workout suggestion payload is not an object.");
  }

  const draft = validateNaturalLanguageWorkoutDraft(parsed);
  const suggestionReason = optionalString(parsed.suggestion_reason);
  if (!suggestionReason) {
    throw new Error("Workout suggestion reason is required.");
  }

  const suggestedTiming = optionalString(parsed.suggested_timing);
  const targetAlignment = optionalString(parsed.target_alignment);
  const agentReply = optionalString(parsed.agent_reply);
  const textToCheck = [draft.title, draft.notes, suggestionReason, suggestedTiming, targetAlignment, agentReply].filter(Boolean).join(" ");

  if (containsUnsafeLanguage(textToCheck)) {
    throw new Error(UNSAFE_WORKOUT_MESSAGE);
  }

  return {
    ...draft,
    suggestion_reason: suggestionReason.slice(0, 240),
    suggested_timing: suggestedTiming?.slice(0, 120) ?? null,
    target_alignment: targetAlignment?.slice(0, 180) ?? null,
    agent_reply: agentReply?.slice(0, 320) ?? null,
  };
}

export function validateWorkoutSuggestionResult(value: unknown): WorkoutSuggestionResult {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Workout suggestion payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim()).filter(Boolean)
    : [];
  const agentReply = optionalString(parsed.agent_reply) ?? "You do not need another workout right now.";
  const textToCheck = [agentReply, ...warnings].join(" ");

  if (containsUnsafeLanguage(textToCheck)) {
    return safeWorkoutResult();
  }

  if (parsed.should_suggest === false) {
    return {
      agent_reply: agentReply.slice(0, 320),
      draft: null,
      warnings,
    };
  }

  const rawSuggestion = parsed.suggestion ?? value;
  let draft: WorkoutSuggestionDraft;
  try {
    draft = validateWorkoutSuggestionDraft({
      ...(asObject(rawSuggestion) ?? {}),
      agent_reply: parsed.agent_reply ?? asObject(rawSuggestion)?.agent_reply,
    });
  } catch (error) {
    if (error instanceof Error && error.message === UNSAFE_WORKOUT_MESSAGE) {
      return safeWorkoutResult();
    }

    throw error;
  }

  return {
    agent_reply: draft.agent_reply ?? agentReply.slice(0, 320),
    draft,
    warnings,
  };
}

export async function suggestWorkout(input: SuggestWorkoutInput): Promise<WorkoutSuggestionResult> {
  const context: WorkoutSuggestionContext = {
    timezone: input.timezone,
    today: input.today,
    currentTimeContext: input.currentTimeContext,
    profile: input.profile,
    latestBodyProfile: input.latestBodyProfile,
    fitnessContext: input.fitnessContext,
    goals: input.goals,
    todayWorkouts: input.todayWorkouts,
    recentWorkouts: input.recentWorkouts,
    plannedWorkouts: input.plannedWorkouts,
    todayMeals: input.todayMeals,
    nutritionContext: input.nutritionContext,
    todayEvents: input.todayEvents,
    currentSuggestion: input.currentSuggestion,
    userFeedback: input.userFeedback,
  };

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Workout suggestion skipped: GEMINI_API_KEY not configured.");
      }

      return requestWorkoutSuggestion(context);
    });

  const raw = await generate(context);
  return validateWorkoutSuggestionResult(raw);
}
