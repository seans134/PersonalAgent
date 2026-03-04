import { isGeminiConfigured, requestPlanEnhancement } from "@/lib/gemini/client";
import type { DailyPlan, Goal, PlannerPreferences } from "./types";

type EnhancementItem = {
  title: string;
  reason: string;
};

type EnhancementPayload = {
  summary: string;
  items: EnhancementItem[];
};

export type EnhancePlanInput = {
  plan: DailyPlan;
  goals: Goal[];
  preferences: PlannerPreferences;
  eventsCount: number;
  generateOutput?: (input: {
    plan: DailyPlan;
    goals: Goal[];
    preferences: PlannerPreferences;
    eventsCount: number;
  }) => Promise<unknown>;
};

export type EnhancePlanResult = {
  plan: DailyPlan;
  summary?: string;
  warning?: string;
};

function containsUnsafeLanguage(text: string): boolean {
  const patterns = [
    /starv(e|ing)/i,
    /skip sleep/i,
    /self-harm/i,
    /purge/i,
    /extreme (diet|calorie|exercise)/i,
    /overtrain/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function validateEnhancementPayload(value: unknown, expectedItems: number): EnhancementPayload {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Enhancement payload is not an object.");
  }

  if (typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    throw new Error("Enhancement summary is invalid.");
  }

  if (!Array.isArray(parsed.items) || parsed.items.length !== expectedItems) {
    throw new Error("Enhancement items are invalid.");
  }

  const items = parsed.items.map((item, index) => {
    const itemObject = asObject(item);
    if (!itemObject) {
      throw new Error(`Enhancement item ${index} is invalid.`);
    }

    const title = itemObject.title;
    const reason = itemObject.reason;

    if (typeof title !== "string" || typeof reason !== "string") {
      throw new Error(`Enhancement item ${index} fields are invalid.`);
    }

    return {
      title: title.trim(),
      reason: reason.trim(),
    };
  });

  return {
    summary: parsed.summary.trim(),
    items,
  };
}

function hasUnsafeContent(payload: EnhancementPayload): boolean {
  if (containsUnsafeLanguage(payload.summary)) {
    return true;
  }

  return payload.items.some((item) => containsUnsafeLanguage(item.title) || containsUnsafeLanguage(item.reason));
}

function applyEnhancedCopy(original: DailyPlan, enhancement: EnhancementPayload): DailyPlan {
  return {
    ...original,
    items: original.items.map((item, index) => ({
      ...item,
      title: enhancement.items[index]?.title || item.title,
      reason: enhancement.items[index]?.reason || item.reason,
    })),
  };
}

export async function enhancePlanCopy(input: EnhancePlanInput): Promise<EnhancePlanResult> {
  const { plan, goals, preferences, eventsCount, generateOutput } = input;

  const generate =
    generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Gemini enhancement skipped: GEMINI_API_KEY not configured.");
      }

      return requestPlanEnhancement({
        plan,
        goals,
        preferences,
        eventsCount,
      });
    });

  try {
    const raw = await generate({
      plan,
      goals,
      preferences,
      eventsCount,
    });

    const validated = validateEnhancementPayload(raw, plan.items.length);

    if (hasUnsafeContent(validated)) {
      return {
        plan,
        warning: "Gemini enhancement skipped due to unsafe content.",
      };
    }

    return {
      plan: applyEnhancedCopy(plan, validated),
      summary: validated.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown enhancement error.";
    return {
      plan,
      warning: `Gemini enhancement skipped: ${message}`,
    };
  }
}
