import { isGeminiConfigured, requestMealSuggestion } from "@/lib/gemini/client";
import { validateNaturalLanguageMealDraft, type NaturalLanguageMealDraft } from "./natural-language-meal";

export type MealSuggestionContext = {
  timezone: string;
  today: string;
  currentTimeContext: unknown;
  profile: unknown;
  latestBodyProfile: unknown;
  nutritionContext: unknown;
  goals: unknown[];
  todayMeals: unknown[];
  recentMeals: unknown[];
  savedMeals: unknown[];
  todayWorkouts: unknown[];
  todayEvents: unknown[];
  currentSuggestion?: unknown;
  userFeedback?: string | null;
};

export type MealSuggestionDraft = Extract<NaturalLanguageMealDraft, { mode: "log" }> & {
  suggestion_reason: string;
  suggested_timing: string | null;
  target_alignment: string | null;
  agent_reply: string | null;
};

export type MealSuggestionResult = {
  agent_reply: string;
  draft: MealSuggestionDraft | null;
  warnings: string[];
};

export type SuggestMealInput = MealSuggestionContext & {
  generateOutput?: (input: MealSuggestionContext) => Promise<unknown>;
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

const SAFE_MEAL_REPLY =
  "I would skip that meal suggestion and keep this steady. A normal meal or snack that fits your hunger and goals is the better move, with no extreme restriction needed.";
const UNSAFE_MEAL_MESSAGE = "Meal suggestion skipped due to unsafe content.";

function hasUnprotectedPhrase(text: string, pattern: RegExp): boolean {
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes("i") ? "gi" : "g");
  const protectedBefore = /(do not|don't|never|avoid|should not|shouldn't|no|without)\s+(?:\w+\s+){0,4}$/i;
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

export function containsUnsafeLanguage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  const unsafePhrases = [
    /extreme (diet|calorie|restriction)/i,
    /unsafe restriction/i,
  ];

  if (unsafePhrases.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (
    hasUnprotectedPhrase(normalized, /starv(?:e|ing)/i) ||
    hasUnprotectedPhrase(normalized, /purge/i) ||
    hasUnprotectedPhrase(normalized, /detox/i) ||
    hasUnprotectedPhrase(normalized, /cleanse/i)
  ) {
    return true;
  }

  const harmfulMotivation = [/(?:use|feel|create|add)\s+(?:\w+\s+){0,3}shame/i, /(?:use|feel|create|add)\s+(?:\w+\s+){0,3}guilt/i];
  return harmfulMotivation.some((pattern) => pattern.test(normalized));
}

function safeMealResult(): MealSuggestionResult {
  return {
    agent_reply: SAFE_MEAL_REPLY,
    draft: null,
    warnings: [],
  };
}

export function validateMealSuggestionDraft(value: unknown): MealSuggestionDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Meal suggestion payload is not an object.");
  }

  const draft = validateNaturalLanguageMealDraft(parsed, "log");
  if (draft.mode !== "log") {
    throw new Error("Meal suggestion must be a meal log draft.");
  }

  const suggestionReason = optionalString(parsed.suggestion_reason);
  if (!suggestionReason) {
    throw new Error("Meal suggestion reason is required.");
  }

  const suggestedTiming = optionalString(parsed.suggested_timing);
  const targetAlignment = optionalString(parsed.target_alignment);
  const agentReply = optionalString(parsed.agent_reply);
  const textToCheck = [draft.name, draft.notes, suggestionReason, suggestedTiming, targetAlignment, agentReply].filter(Boolean).join(" ");

  if (containsUnsafeLanguage(textToCheck)) {
    throw new Error(UNSAFE_MEAL_MESSAGE);
  }

  return {
    ...draft,
    suggestion_reason: suggestionReason.slice(0, 240),
    suggested_timing: suggestedTiming?.slice(0, 120) ?? null,
    target_alignment: targetAlignment?.slice(0, 180) ?? null,
    agent_reply: agentReply?.slice(0, 320) ?? null,
  };
}

export function validateMealSuggestionResult(value: unknown): MealSuggestionResult {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Meal suggestion payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim()).filter(Boolean)
    : [];
  const agentReply = optionalString(parsed.agent_reply) ?? "Nothing else looks necessary right now.";
  const textToCheck = [agentReply, ...warnings].join(" ");

  if (containsUnsafeLanguage(textToCheck)) {
    return safeMealResult();
  }

  if (parsed.should_suggest === false) {
    return {
      agent_reply: agentReply.slice(0, 320),
      draft: null,
      warnings,
    };
  }

  const rawSuggestion = parsed.suggestion ?? value;
  let draft: MealSuggestionDraft;
  try {
    draft = validateMealSuggestionDraft({
      ...(asObject(rawSuggestion) ?? {}),
      agent_reply: parsed.agent_reply ?? asObject(rawSuggestion)?.agent_reply,
    });
  } catch (error) {
    if (error instanceof Error && error.message === UNSAFE_MEAL_MESSAGE) {
      return safeMealResult();
    }

    throw error;
  }

  return {
    agent_reply: draft.agent_reply ?? agentReply.slice(0, 320),
    draft,
    warnings,
  };
}

export async function suggestMeal(input: SuggestMealInput): Promise<MealSuggestionResult> {
  const context: MealSuggestionContext = {
    timezone: input.timezone,
    today: input.today,
    currentTimeContext: input.currentTimeContext,
    profile: input.profile,
    latestBodyProfile: input.latestBodyProfile,
    nutritionContext: input.nutritionContext,
    goals: input.goals,
    todayMeals: input.todayMeals,
    recentMeals: input.recentMeals,
    savedMeals: input.savedMeals,
    todayWorkouts: input.todayWorkouts,
    todayEvents: input.todayEvents,
    currentSuggestion: input.currentSuggestion,
    userFeedback: input.userFeedback,
  };

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Meal suggestion skipped: GEMINI_API_KEY not configured.");
      }

      return requestMealSuggestion(context);
    });

  const raw = await generate(context);
  return validateMealSuggestionResult(raw);
}
