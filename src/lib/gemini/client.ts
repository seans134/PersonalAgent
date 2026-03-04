import type { DailyPlan, Goal, PlannerPreferences } from "@/lib/planner/types";

export type EnhancePromptInput = {
  plan: DailyPlan;
  goals: Goal[];
  preferences: PlannerPreferences;
  eventsCount: number;
};

function buildSystemInstruction(): string {
  return [
    "You are improving wording only. Do not change schedule timing.",
    "Return strict JSON with shape: {summary: string, items: [{title: string, reason: string}]}",
    "Item count must equal input plan item count and map by index.",
    "Avoid medical advice, extreme dieting, sleep deprivation, overtraining, or unsafe behavior.",
    "Keep each title concise (<= 60 chars) and each reason actionable (<= 180 chars).",
  ].join("\n");
}

function buildUserPrompt(input: EnhancePromptInput): string {
  return JSON.stringify({
    goals: input.goals,
    preferences: input.preferences,
    eventsCount: input.eventsCount,
    plan: input.plan,
  });
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function requestPlanEnhancement(input: EnhancePromptInput): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildUserPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gemini request failed with status ${response.status}`);
  }

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error("Gemini returned empty content.");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }
}
