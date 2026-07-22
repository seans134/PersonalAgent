import { isGeminiConfigured, requestCoachIntent } from "@/lib/gemini/client";

export type CoachDomain = "meal" | "workout";

export type MealCoachIntent = "log" | "saved" | "suggest";
export type WorkoutCoachIntent = "log" | "suggest";
export type CoachIntent = MealCoachIntent | WorkoutCoachIntent;

export type CoachIntentResult = {
  intent: CoachIntent;
  reason: string;
  source: "model" | "heuristic";
};

export type ClassifyCoachIntentInput = {
  domain: CoachDomain;
  text: string;
  hasActiveSuggestion?: boolean;
  generateOutput?: (input: {
    domain: CoachDomain;
    text: string;
    hasActiveSuggestion: boolean;
  }) => Promise<unknown>;
};

const SUGGEST_PATTERNS = [
  /\?\s*$/,
  /\b(what|which|should i|can you|could you|any ideas?|recommend|suggest|give me|idea for)\b/i,
  /\b(i'?m hungry|i am hungry|nothing sounds good)\b/i,
];

const SAVED_PATTERNS = [
  /\b(save|store|remember|add) (this|that|it|my|a)?\s*(as|to)?\s*(a )?(reusable|usual|go.?to|favou?rite|template|preset)\b/i,
  /\b(my usual|go.?to|favou?rite|reusable|template|preset)\b/i,
];

const LOG_PATTERNS = [
  /\b(i )?(ate|had|just finished|finished|did|ran|lifted|trained|worked out|drank|consumed)\b/i,
  /\b(for )?(breakfast|lunch|dinner|snack) (was|i)\b/i,
];

function validIntents(domain: CoachDomain): CoachIntent[] {
  return domain === "meal" ? ["log", "saved", "suggest"] : ["log", "suggest"];
}

/**
 * Used when Gemini is unavailable or returns something unusable. Deliberately
 * biased toward "suggest" for questions and "log" for past-tense statements,
 * which covers the overwhelming majority of real phrasing.
 */
export function heuristicCoachIntent(domain: CoachDomain, text: string): CoachIntent {
  const trimmed = text.trim();

  if (domain === "meal" && SAVED_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "saved";
  }

  if (SUGGEST_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "suggest";
  }

  if (LOG_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "log";
  }

  // A bare description with no past-tense marker is more often a request than a
  // record, and a wrong "suggest" is cheaper to recover from than a wrong log.
  return "suggest";
}

export async function classifyCoachIntent(input: ClassifyCoachIntentInput): Promise<CoachIntentResult> {
  const text = input.text.trim();
  const hasActiveSuggestion = input.hasActiveSuggestion ?? false;

  if (!text) {
    throw new Error("Add a message before sending.");
  }

  const generate = input.generateOutput ?? (isGeminiConfigured() ? requestCoachIntent : null);

  if (!generate) {
    return {
      intent: heuristicCoachIntent(input.domain, text),
      reason: "Gemini is not configured, so the intent was matched locally.",
      source: "heuristic",
    };
  }

  try {
    const output = (await generate({ domain: input.domain, text, hasActiveSuggestion })) as {
      intent?: unknown;
      reason?: unknown;
    };
    const allowed = validIntents(input.domain);
    const intent = allowed.find((candidate) => candidate === output?.intent);

    if (!intent) {
      return {
        intent: heuristicCoachIntent(input.domain, text),
        reason: "The classifier returned an unknown intent, so the intent was matched locally.",
        source: "heuristic",
      };
    }

    return {
      intent,
      reason: typeof output.reason === "string" ? output.reason.slice(0, 120) : "",
      source: "model",
    };
  } catch {
    return {
      intent: heuristicCoachIntent(input.domain, text),
      reason: "The classifier was unavailable, so the intent was matched locally.",
      source: "heuristic",
    };
  }
}
