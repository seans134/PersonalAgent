import type { DailyPlan, Goal, PlannerPreferences } from "@/lib/planner/types";

export type EnhancePromptInput = {
  plan: DailyPlan;
  goals: Goal[];
  preferences: PlannerPreferences;
  eventsCount: number;
};

export type OnboardingParsePromptInput = {
  text: string;
  mode: "school_work" | "weekly_rhythm" | "goals";
  timezone: string;
};

export type WorkoutLogParsePromptInput = {
  text: string;
  timezone: string;
};

export type WorkoutScheduleParsePromptInput = {
  text: string;
  timezone: string;
};

export type MealParsePromptInput = {
  mode: "log" | "saved";
  text: string;
  timezone: string;
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

function buildOnboardingParserInstruction(): string {
  return [
    "Extract onboarding drafts from the user's natural-language note.",
    "Return strict JSON with shape: {profile: object, goals: array, scheduleBlocks: array, warnings: array}.",
    "For mode school_work, extract only school and work schedule blocks. Return no goals.",
    "For mode weekly_rhythm, extract only study, personal, and unavailable schedule blocks. Return no goals.",
    "For mode goals, extract only goals. Return no schedule blocks.",
    "Use day numbers for daysOfWeek where Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6.",
    "Use 24-hour HH:MM times only. Use null or omit fields when uncertain.",
    "Valid schedule categories are school, work, study, personal, unavailable.",
    "Valid workoutPreference values are none, light, moderate, intense.",
    "Valid goal taskType values are general, focus, fitness, wellness, admin.",
    "For goals, extract minimumDailyMinutes as an integer from 0 to 720. Use 0 when there is no clear daily minimum.",
    "Do not invent specific goals, times, or dates. Include uncertainty in warnings.",
    "Avoid medical advice, extreme dieting, sleep deprivation, overtraining, or unsafe behavior.",
  ].join("\n");
}

function buildWorkoutParserInstruction(): string {
  return [
    "Extract one workout log draft from the user's natural-language note.",
    "Return strict JSON with shape: {logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes, warnings}.",
    "Valid workout_type values are strength, cardio, recovery, sport.",
    "Valid methods: strength uses sets_reps_weight or bodyweight_sets; cardio uses distance_time, time_only, intervals; recovery uses mobility_flow, stretching, breathwork; sport uses game, practice, skills.",
    "Use ISO date/time for logged_at when the user provides a time; otherwise null.",
    "Use numeric values for duration_minutes, calories_burned, sets, reps, weight, distance, intervals, work_seconds, rest_seconds, and rounds.",
    "Do not invent specific metrics. Use null and include a warning when details are uncertain.",
    "Avoid medical advice, extreme dieting, sleep deprivation, overtraining, or unsafe behavior.",
  ].join("\n");
}

function buildWorkoutScheduleParserInstruction(): string {
  return [
    "Extract a weekly planned workout schedule from the user's natural-language note.",
    "Return strict JSON with shape: {items: array, warnings: array}.",
    "Each item shape is {day_of_week, workout_type, tracking_method, title, duration_minutes, metrics, notes}.",
    "Use day_of_week numbers where Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6, Sunday=7.",
    "Valid workout_type values are strength, cardio, recovery, sport.",
    "Valid methods: strength uses sets_reps_weight or bodyweight_sets; cardio uses distance_time, time_only, intervals; recovery uses mobility_flow, stretching, breathwork; sport uses game, practice, skills.",
    "Use numeric values for duration_minutes, sets, reps, weight, distance, intervals, work_seconds, rest_seconds, and rounds.",
    "Do not invent specific metrics, days, or durations. Use null and include a warning when details are uncertain.",
    "Avoid medical advice, extreme dieting, sleep deprivation, overtraining, or unsafe behavior.",
  ].join("\n");
}

function buildMealParserInstruction(): string {
  return [
    "Extract one meal draft from the user's natural-language note.",
    "Return strict JSON with shape: {logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes, warnings}.",
    "For mode saved, logged_at and meal_type may be null because reusable meals are not logged yet.",
    "Valid meal_type values are breakfast, lunch, dinner, snack, meal.",
    "Use ISO date/time for logged_at when the user provides a time; otherwise null.",
    "Use numeric values for calories and grams. Use null for unknown nutrition.",
    "Do not invent precise nutrition when the note is vague. Include a warning when nutrition is estimated or uncertain.",
    "Avoid medical advice, extreme dieting, unsafe restrictions, purging, or shame-based wording.",
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

function buildOnboardingParserPrompt(input: OnboardingParsePromptInput): string {
  return JSON.stringify({
    mode: input.mode,
    timezone: input.timezone,
    note: input.text,
    expectedShape: {
      profile: {
        workStartTime: "HH:MM | null",
        workEndTime: "HH:MM | null",
        noMeetingStartTime: "HH:MM | null",
        noMeetingEndTime: "HH:MM | null",
        focusBlockMinutes: "number | null",
        workoutPreference: "none | light | moderate | intense | null",
      },
      goals: [
        {
          title: "string",
          description: "string | null",
          priority: "1 | 2 | 3",
          taskType: "general | focus | fitness | wellness | admin",
          minimumDailyMinutes: "number | null",
          endDate: "YYYY-MM-DD | null",
        },
      ],
      scheduleBlocks: [
        {
          title: "string",
          category: "school | work | study | personal | unavailable",
          daysOfWeek: "number[]",
          startTime: "HH:MM",
          endTime: "HH:MM",
        },
      ],
      warnings: ["string"],
    },
  });
}

function buildWorkoutParserPrompt(input: WorkoutLogParsePromptInput): string {
  return JSON.stringify({
    timezone: input.timezone,
    note: input.text,
    expectedShape: {
      logged_at: "ISO string | null",
      workout_type: "strength | cardio | recovery | sport",
      tracking_method:
        "sets_reps_weight | bodyweight_sets | distance_time | time_only | intervals | mobility_flow | stretching | breathwork | game | practice | skills",
      title: "string",
      duration_minutes: "number",
      intensity: "light | moderate | intense",
      calories_burned: "number | null",
      metrics: {
        exercise_name: "string | null",
        sets: "number | null",
        reps: "number | null",
        weight: "number | null",
        weight_unit: "lb | kg | null",
        distance: "number | null",
        distance_unit: "mi | km | null",
        intervals: "number | null",
        work_seconds: "number | null",
        rest_seconds: "number | null",
        focus_area: "string | null",
        rounds: "number | null",
        sport_name: "string | null",
        result: "string | null",
        drill: "string | null",
        skill: "string | null",
      },
      notes: "string | null",
      warnings: ["string"],
    },
  });
}

function buildWorkoutScheduleParserPrompt(input: WorkoutScheduleParsePromptInput): string {
  return JSON.stringify({
    timezone: input.timezone,
    note: input.text,
    expectedShape: {
      items: [
        {
          day_of_week: "1 | 2 | 3 | 4 | 5 | 6 | 7",
          workout_type: "strength | cardio | recovery | sport",
          tracking_method:
            "sets_reps_weight | bodyweight_sets | distance_time | time_only | intervals | mobility_flow | stretching | breathwork | game | practice | skills",
          title: "string",
          duration_minutes: "number | null",
          metrics: {
            exercise_name: "string | null",
            sets: "number | null",
            reps: "number | null",
            weight: "number | null",
            weight_unit: "lb | kg | null",
            distance: "number | null",
            distance_unit: "mi | km | null",
            intervals: "number | null",
            work_seconds: "number | null",
            rest_seconds: "number | null",
            focus_area: "string | null",
            rounds: "number | null",
            sport_name: "string | null",
            drill: "string | null",
            skill: "string | null",
          },
          notes: "string | null",
        },
      ],
      warnings: ["string"],
    },
  });
}

function buildMealParserPrompt(input: MealParsePromptInput): string {
  return JSON.stringify({
    mode: input.mode,
    timezone: input.timezone,
    note: input.text,
    expectedShape: {
      logged_at: "ISO string | null",
      meal_type: "breakfast | lunch | dinner | snack | meal | null",
      name: "string",
      calories: "number | null",
      protein_grams: "number | null",
      carbs_grams: "number | null",
      fat_grams: "number | null",
      fiber_grams: "number | null",
      notes: "string | null",
      warnings: ["string"],
    },
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

export async function requestOnboardingParse(input: OnboardingParsePromptInput): Promise<unknown> {
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
        parts: [{ text: buildOnboardingParserInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildOnboardingParserPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
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

export async function requestWorkoutLogParse(input: WorkoutLogParsePromptInput): Promise<unknown> {
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
        parts: [{ text: buildWorkoutParserInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildWorkoutParserPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
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

export async function requestWorkoutScheduleParse(input: WorkoutScheduleParsePromptInput): Promise<unknown> {
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
        parts: [{ text: buildWorkoutScheduleParserInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildWorkoutScheduleParserPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
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

export async function requestMealParse(input: MealParsePromptInput): Promise<unknown> {
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
        parts: [{ text: buildMealParserInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildMealParserPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
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
