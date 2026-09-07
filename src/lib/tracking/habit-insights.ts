import {
  type HabitDigest,
  type HabitDigestImprovement,
  type HabitMetrics,
  type HabitPeriod,
  type Nudge,
} from "@personal-agent/core";
import { isGeminiConfigured, requestHabitDigest, type HabitDigestPromptInput } from "@/lib/gemini/client";
import { containsUnsafeLanguage } from "./meal-suggestions";

export type HabitDigestSource = "gemini" | "deterministic";

export type HabitDigestResult = {
  digest: HabitDigest;
  source: HabitDigestSource;
};

export type GenerateHabitDigestInput = {
  period: HabitPeriod;
  timezone: string;
  metrics: HabitMetrics;
  nudges: Nudge[];
  goals?: unknown[];
  previousMetrics?: HabitMetrics | null;
  /** Injectable for tests so Vitest never hits the live Gemini API. */
  generateOutput?: (input: HabitDigestPromptInput) => Promise<unknown>;
};

const HEADLINE_MAX = 120;
const ENDORSEMENT_MAX = 160;
const SUGGESTION_MAX = 180;
const AREA_MAX = 40;
const SUMMARY_MAX = 240;
const MAX_ENDORSEMENTS = 3;
const MAX_IMPROVEMENTS = 3;

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function cleanStringList(value: unknown, max: number, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => cleanString(entry, max))
    .filter((entry): entry is string => entry !== null)
    .slice(0, limit);
}

function cleanImprovements(value: unknown): HabitDigestImprovement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: HabitDigestImprovement[] = [];
  for (const entry of value) {
    const parsed = asObject(entry);
    if (!parsed) {
      continue;
    }
    const suggestion = cleanString(parsed.suggestion, SUGGESTION_MAX);
    if (!suggestion) {
      continue;
    }
    const area = cleanString(parsed.area, AREA_MAX) ?? "Suggestion";
    result.push({ area, suggestion });
    if (result.length >= MAX_IMPROVEMENTS) {
      break;
    }
  }
  return result;
}

function digestText(digest: HabitDigest): string {
  return [
    digest.headline,
    digest.summary,
    ...digest.endorsements,
    ...digest.improvements.flatMap((item) => [item.area, item.suggestion]),
  ].join(" ");
}

/**
 * Turns a validated LLM payload into a clamped `HabitDigest`. Throws when the payload is
 * unusable or trips the shared unsafe-language gate, so callers fall back to a
 * deterministic digest instead of surfacing unsafe or empty copy.
 */
export function validateHabitDigest(value: unknown): HabitDigest {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Habit digest payload is not an object.");
  }

  const headline = cleanString(parsed.headline, HEADLINE_MAX);
  const summary = cleanString(parsed.summary, SUMMARY_MAX);
  const endorsements = cleanStringList(parsed.endorsements, ENDORSEMENT_MAX, MAX_ENDORSEMENTS);
  const improvements = cleanImprovements(parsed.improvements);

  if (!headline || !summary) {
    throw new Error("Habit digest is missing a headline or summary.");
  }

  const digest: HabitDigest = { headline, summary, endorsements, improvements };

  if (containsUnsafeLanguage(digestText(digest))) {
    throw new Error("Habit digest skipped due to unsafe content.");
  }

  return digest;
}

/**
 * Builds a digest purely from the deterministic nudge list. Used when Gemini is
 * unconfigured or its output is rejected, so the Analysis page always renders.
 */
export function buildDeterministicDigest(metrics: HabitMetrics, nudges: Nudge[]): HabitDigest {
  const endorsements = nudges.filter((n) => n.tone === "positive").map((n) => n.message).slice(0, MAX_ENDORSEMENTS);
  const improvements = nudges
    .filter((n) => n.tone === "improve")
    .map((n) => ({ area: improvementArea(n.metric), suggestion: n.message.slice(0, SUGGESTION_MAX) }))
    .slice(0, MAX_IMPROVEMENTS);

  const { daysLogged } = metrics.nutrition;
  const { sessions } = metrics.workouts;
  const headline =
    endorsements.length > 0
      ? "Here's how your habits are trending."
      : "Let's build some momentum from here.";
  const summary =
    `You logged meals on ${daysLogged} ${daysLogged === 1 ? "day" : "days"} and ${sessions} ${sessions === 1 ? "workout" : "workouts"} this ${metrics.range.days > 1 ? "period" : "day"}.`.slice(
      0,
      SUMMARY_MAX,
    );

  return { headline, summary, endorsements, improvements };
}

function improvementArea(metric: string): string {
  switch (metric) {
    case "workout":
      return "Movement";
    case "protein":
      return "Protein";
    case "calories":
      return "Calories";
    case "logging":
      return "Logging";
    default:
      return "Suggestion";
  }
}

/**
 * Produces the narrated digest: asks Gemini when configured, validates + safety-gates the
 * result, and falls back to a deterministic digest on any failure or unsafe content.
 */
export async function generateHabitDigest(input: GenerateHabitDigestInput): Promise<HabitDigestResult> {
  const { metrics, nudges } = input;
  const generate = input.generateOutput ?? (isGeminiConfigured() ? requestHabitDigest : null);

  if (!generate) {
    return { digest: buildDeterministicDigest(metrics, nudges), source: "deterministic" };
  }

  try {
    const raw = await generate({
      period: input.period,
      timezone: input.timezone,
      metrics,
      nudges,
      goals: input.goals ?? [],
      previousMetrics: input.previousMetrics ?? null,
    });
    return { digest: validateHabitDigest(raw), source: "gemini" };
  } catch {
    return { digest: buildDeterministicDigest(metrics, nudges), source: "deterministic" };
  }
}
