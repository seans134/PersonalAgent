import type { DailyPlan, Goal, PlannerPreferences } from "@/lib/planner/types";

type OpenAIMessage = {
  role: "system" | "user";
  content: string;
};

export type EnhancePromptInput = {
  plan: DailyPlan;
  goals: Goal[];
  preferences: PlannerPreferences;
  eventsCount: number;
};

function buildMessages(input: EnhancePromptInput): OpenAIMessage[] {
  const rules = [
    "You are improving wording only. Do not change schedule timing.",
    "Return strict JSON with shape: {summary: string, items: [{title: string, reason: string}]}",
    "Item count must equal input plan item count and map by index.",
    "Avoid medical advice, extreme dieting, sleep deprivation, overtraining, or unsafe behavior.",
    "Keep each title concise (<= 60 chars) and each reason actionable (<= 180 chars).",
  ].join("\n");

  return [
    {
      role: "system",
      content: rules,
    },
    {
      role: "user",
      content: JSON.stringify({
        goals: input.goals,
        preferences: input.preferences,
        eventsCount: input.eventsCount,
        plan: input.plan,
      }),
    },
  ];
}

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function requestPlanEnhancement(input: EnhancePromptInput): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(input),
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed with status ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }
}
