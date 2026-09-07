import type { DailyPlan, Goal, PlannerPreferences } from "@/lib/planner/types";
import type { HabitMetrics, HabitPeriod, Nudge } from "@personal-agent/core";

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

export type WorkoutSuggestionPromptInput = {
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

export type MealParsePromptInput = {
  mode: "log" | "saved";
  text: string;
  timezone: string;
};

export type CoachIntentPromptInput = {
  domain: "meal" | "workout";
  text: string;
  hasActiveSuggestion: boolean;
};

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type SyllabusParsePromptInput = {
  parts: GeminiPart[];
  timezone: string;
  today: string;
};

export type MealSuggestionPromptInput = {
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

function buildWorkoutSuggestionInstruction(): string {
  return [
    "Decide whether a workout suggestion is useful today.",
    "Return strict JSON with shape: {should_suggest: boolean, suggestion: object | null, agent_reply: string, warnings: array}.",
    "When should_suggest is true, suggestion shape is {logged_at, workout_type, tracking_method, title, duration_minutes, intensity, calories_burned, metrics, notes, suggestion_reason, suggested_timing, target_alignment}.",
    "When should_suggest is false, set suggestion to null and explain why in agent_reply.",
    "Use currentTimeContext as the source of truth for the user's current local date and time. Do not infer or invent the current time.",
    "Use the user's fitness goals, body profile, workout history, today's planned/completed workouts, today's meals/nutrition context, and calendar events.",
    "If the user already has a planned workout for today that is not completed, prefer adapting or recommending that workout instead of inventing a separate session.",
    "If the user already completed enough similar work today, especially the same training type such as hypertrophy after hypertrophy, do not suggest another workout unless the user explicitly asks.",
    "Match the workout to today's available time, recent training load, current meals/energy context, and stated workout preference.",
    "Support the fitness goal without medical, injury rehab, guaranteed fat loss, or guaranteed performance claims.",
    "Avoid extreme intensity, overtraining, unsafe behavior, shame-based wording, or instructions to ignore pain.",
    "If currentSuggestion and userFeedback are provided, revise the current suggestion to match the feedback while preserving safety and valid schema.",
    "If userFeedback asks a question, answer it directly in agent_reply. Keep or adjust the suggestion only if the answer implies a better fit.",
    "If userFeedback asks for an alternative, another option, or a change, the returned suggestion must be meaningfully different from currentSuggestion unless unsafe or impossible.",
    "Use conservative duration and intensity when context is incomplete. Include uncertainty in warnings.",
    "Use valid workout_type and tracking_method combinations only.",
    "Keep notes, suggestion_reason, and target_alignment concise and actionable.",
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

function buildSyllabusParserInstruction(): string {
  return [
    "Extract structured course data from the attached or pasted syllabus.",
    "Return strict JSON with shape: {course: {code, name, term, target_grade}, categories: [{name, weight}], items: [{kind, title, categoryName, due_at, score_max}], warnings: [string]}.",
    "course.code is the course code such as CHEM 201 or null. course.name is the full course title. course.term is the academic term such as Fall 2026 or null.",
    "course.target_grade is a number 0-100 only if the syllabus states a required or target grade; otherwise null.",
    "categories are the weighted grade breakdown. Each weight is a percentage number 0-100 (e.g. Midterm 30 means weight 30). Only include categories that carry a grade weight.",
    "items are graded deliverables with a specific due date. Valid kind values are assignment, quiz, exam.",
    "Map exam, midterm, final, and test to kind exam. Map homework, hw, problem set, project, lab, essay, paper, and report to kind assignment. Map quiz and pop quiz to kind quiz.",
    "categoryName on each item must match the name of one of the categories when the syllabus indicates which bucket the item counts toward; otherwise null.",
    "due_at must be a full ISO 8601 timestamp at 23:59 local time in the provided timezone on the item's due date. Infer the year from term or today when the syllabus omits it. Use null when there is no specific due date.",
    "score_max is the item's maximum points if stated; otherwise null (a default is applied later).",
    "Do not invent categories, items, weights, or dates that are not in the syllabus. Record anything ambiguous or uncertain in warnings.",
  ].join("\n");
}

function buildMealSuggestionInstruction(): string {
  return [
    "Decide whether a meal or snack suggestion is useful right now.",
    "Return strict JSON with shape: {should_suggest: boolean, suggestion: object | null, agent_reply: string, warnings: array}.",
    "When should_suggest is true, suggestion shape is {logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes, suggestion_reason, suggested_timing, target_alignment}.",
    "When should_suggest is false, set suggestion to null and explain why in agent_reply.",
    "Use currentTimeContext as the source of truth for the user's current local date and time. Do not infer or invent the current time.",
    "Set logged_at to currentTimeContext.currentIso because accepting the suggestion logs the meal now.",
    "Use the user's fitness goals, body profile, today's nutrition totals, meals from today, recent meals, saved meals, today's events, and workout/training sessions as context.",
    "If the user has explicit calorie or macro targets in their goals, notes, saved meals, or body profile, suggest a meal that helps close the gap for today.",
    "If there are no explicit calorie or macro targets, support the fitness goal qualitatively and do not invent a daily calorie target.",
    "If the user has already eaten enough for the current context or no meal is needed now, do not suggest food unless the user explicitly asks.",
    "If asked whether a calorie total is a target, clarify that logged intake so far is not a prescribed target unless an explicit target exists.",
    "Consider whether the meal should fit before or after a training session, but do not give medical, clinical, or performance guarantees.",
    "Prefer familiar foods from saved or recent meals when they fit; otherwise suggest a simple meal with common ingredients.",
    "Use null for nutrition values when uncertain. Use approximate nutrition only for common foods or meals already logged/saved, and mention uncertainty in warnings.",
    "If currentSuggestion and userFeedback are provided, revise the current suggestion to match the feedback while preserving safety and valid schema.",
    "If userFeedback asks a question, answer it directly in agent_reply. Keep or adjust the suggestion only if the answer implies a better fit.",
    "If userFeedback asks for an alternative, another option, or a change, the returned suggestion must be meaningfully different from currentSuggestion unless unsafe or impossible.",
    "Use ISO date/time for logged_at near the suggested timing. Use meal_type values breakfast, lunch, dinner, snack, or meal.",
    "Keep notes, suggestion_reason, and target_alignment concise, supportive, and non-judgmental.",
    "Avoid medical advice, extreme dieting, unsafe restrictions, purging, shame-based wording, or rigid calorie targets.",
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

function buildWorkoutSuggestionPrompt(input: WorkoutSuggestionPromptInput): string {
  return JSON.stringify({
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
    currentSuggestion: input.currentSuggestion ?? null,
    userFeedback: input.userFeedback ?? null,
    expectedShape: {
      should_suggest: "boolean",
      suggestion: "workout object | null",
      agent_reply: "string",
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

function buildMealSuggestionPrompt(input: MealSuggestionPromptInput): string {
  return JSON.stringify({
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
    currentSuggestion: input.currentSuggestion ?? null,
    userFeedback: input.userFeedback ?? null,
    expectedShape: {
      should_suggest: "boolean",
      suggestion: "meal object | null",
      agent_reply: "string",
      warnings: ["string"],
    },
  });
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type HabitDigestPromptInput = {
  period: HabitPeriod;
  timezone: string;
  metrics: HabitMetrics;
  nudges: Nudge[];
  goals: unknown[];
  previousMetrics?: HabitMetrics | null;
};

function buildHabitDigestInstruction(): string {
  return [
    "You are a supportive habit coach summarizing a user's logged meals and workouts.",
    "Return strict JSON with shape: {headline: string, endorsements: string[], improvements: [{area: string, suggestion: string}], summary: string}.",
    "Every number, streak, average, and count is already computed and provided in metrics and nudges. Narrate those numbers — never invent, recompute, or estimate new figures, targets, calories, or macros.",
    "If a target (calorie or protein) is null, the user has not set one: speak qualitatively and do not invent a target.",
    "endorsements: 1-3 short, specific celebrations of good habits grounded in the metrics (streaks, consistency, adherence, balance).",
    "improvements: 0-3 gentle, actionable suggestions grounded in the improvement nudges and metrics. Each has a short area label and one concrete suggestion.",
    "headline: one encouraging sentence capturing the period. summary: 1-2 sentences tying it together.",
    "Match the period: 'daily' reflects today, 'weekly' reflects the last 7 days. Use previousMetrics only to note direction of change (up/down/steady), never to fabricate figures.",
    "Always lead with what is going well before what to improve. Be warm, concise, and non-judgmental.",
    "Avoid medical advice, diagnosis, extreme dieting, unsafe restriction, starvation, purging, detoxes, overtraining, guilt, or shame-based wording.",
    "Keep headline <= 120 chars, each endorsement <= 160 chars, each suggestion <= 180 chars, summary <= 240 chars.",
  ].join("\n");
}

function buildHabitDigestPrompt(input: HabitDigestPromptInput): string {
  return JSON.stringify({
    period: input.period,
    timezone: input.timezone,
    metrics: input.metrics,
    nudges: input.nudges,
    goals: input.goals,
    previousMetrics: input.previousMetrics ?? null,
    expectedShape: {
      headline: "string",
      endorsements: ["string"],
      improvements: [{ area: "string", suggestion: "string" }],
      summary: "string",
    },
  });
}

export async function requestHabitDigest(input: HabitDigestPromptInput): Promise<unknown> {
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
        parts: [{ text: buildHabitDigestInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildHabitDigestPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
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

export async function requestWorkoutSuggestion(input: WorkoutSuggestionPromptInput): Promise<unknown> {
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
        parts: [{ text: buildWorkoutSuggestionInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildWorkoutSuggestionPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
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

export async function requestSyllabusParse(input: SyllabusParsePromptInput): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const promptPart: GeminiPart = {
    text: JSON.stringify({
      timezone: input.timezone,
      today: input.today,
      instructions: "Parse the attached syllabus into the expectedShape below.",
      expectedShape: {
        course: {
          code: "string | null",
          name: "string",
          term: "string | null",
          target_grade: "number 0-100 | null",
        },
        categories: [{ name: "string", weight: "number 0-100" }],
        items: [
          {
            kind: "assignment | quiz | exam",
            title: "string",
            categoryName: "string | null",
            due_at: "ISO string at 23:59 local | null",
            score_max: "number | null",
          },
        ],
        warnings: ["string"],
      },
    }),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSyllabusParserInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [promptPart, ...input.parts],
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

export async function requestMealSuggestion(input: MealSuggestionPromptInput): Promise<unknown> {
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
        parts: [{ text: buildMealSuggestionInstruction() }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildMealSuggestionPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
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

function buildCoachIntentInstruction(domain: "meal" | "workout"): string {
  const past = domain === "meal" ? "ate" : "trained";
  const savedLine =
    domain === "meal"
      ? '"saved" means the user is describing a reusable meal template to store for later, not something they just ate.'
      : "";

  return [
    `Classify what the user wants from the ${domain} coach. Return strict JSON with shape: {intent: string, reason: string}.`,
    `Valid intent values are ${domain === "meal" ? '"log", "saved", "suggest"' : '"log", "suggest"'}.`,
    `"log" means the user is reporting something they already ${past} and want recorded.`,
    savedLine,
    `"suggest" means the user is asking the coach to recommend a ${domain}, or is reacting to an existing suggestion.`,
    "When hasActiveSuggestion is true and the note reads as feedback on that suggestion, choose \"suggest\".",
    "Prefer \"suggest\" for questions, and \"log\" for past-tense statements of fact.",
    "Keep reason under 120 characters.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCoachIntentPrompt(input: CoachIntentPromptInput): string {
  return JSON.stringify({
    domain: input.domain,
    note: input.text,
    hasActiveSuggestion: input.hasActiveSuggestion,
    expectedShape: {
      intent: input.domain === "meal" ? "log | saved | suggest" : "log | suggest",
      reason: "string",
    },
  });
}

export async function requestCoachIntent(input: CoachIntentPromptInput): Promise<unknown> {
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
        parts: [{ text: buildCoachIntentInstruction(input.domain) }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildCoachIntentPrompt(input) }],
        },
      ],
      generationConfig: {
        temperature: 0,
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
