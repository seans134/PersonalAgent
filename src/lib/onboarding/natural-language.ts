import { isGeminiConfigured, requestOnboardingParse } from "@/lib/gemini/client";

export type OnboardingGoalTaskType = "general" | "focus" | "fitness" | "wellness" | "admin";

export type OnboardingGoalDraft = {
  title: string;
  description?: string | null;
  priority: 1 | 2 | 3;
  taskType: OnboardingGoalTaskType;
  minimumDailyMinutes: number;
  endDate?: string | null;
};

export type OnboardingScheduleBlockDraft = {
  title: string;
  category: "school" | "work" | "study" | "personal" | "unavailable";
  daysOfWeek: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type OnboardingProfileDraft = {
  workStartTime?: string | null;
  workEndTime?: string | null;
  noMeetingStartTime?: string | null;
  noMeetingEndTime?: string | null;
  focusBlockMinutes?: number | null;
  workoutPreference?: "none" | "light" | "moderate" | "intense" | null;
};

export type NaturalLanguageOnboardingDraft = {
  profile: OnboardingProfileDraft;
  goals: OnboardingGoalDraft[];
  scheduleBlocks: OnboardingScheduleBlockDraft[];
  warnings: string[];
};

export type NaturalLanguageOnboardingMode = "school_work" | "weekly_rhythm" | "goals";

export type ParseNaturalLanguageOnboardingInput = {
  text: string;
  mode: NaturalLanguageOnboardingMode;
  timezone?: string;
  generateOutput?: (input: { text: string; mode: NaturalLanguageOnboardingMode; timezone: string }) => Promise<unknown>;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = new Set(["school", "work", "study", "personal", "unavailable"]);
const WORKOUT_PREFERENCES = new Set(["none", "light", "moderate", "intense"]);
const GOAL_TASK_TYPES = new Set(["general", "focus", "fitness", "wellness", "admin"]);

const MODE_CATEGORIES: Record<NaturalLanguageOnboardingMode, Set<OnboardingScheduleBlockDraft["category"]>> = {
  school_work: new Set(["school", "work"]),
  weekly_rhythm: new Set(["study", "personal", "unavailable"]),
  goals: new Set(),
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTime(value: unknown, label: string, warnings: string[]): string | null {
  const text = optionalString(value);
  if (!text) {
    return null;
  }

  const normalized = /^\d{2}:\d{2}:\d{2}$/.test(text) ? text.slice(0, 5) : text;
  if (!TIME_PATTERN.test(normalized)) {
    warnings.push(`${label} was ignored because it was not a valid HH:MM time.`);
    return null;
  }

  return normalized;
}

function normalizeDate(value: unknown, label: string, warnings: string[]): string | null {
  const text = optionalString(value);
  if (!text) {
    return null;
  }

  if (!DATE_PATTERN.test(text)) {
    warnings.push(`${label} was ignored because it was not a valid YYYY-MM-DD date.`);
    return null;
  }

  return text;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizePriority(value: unknown): 1 | 2 | 3 {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }

  if (value <= 1) return 1;
  if (value === 2) return 2;
  return 3;
}

function normalizeGoalTaskType(value: unknown): OnboardingGoalTaskType {
  const text = optionalString(value)?.toLowerCase();
  if (text === "exercise") {
    return "fitness";
  }

  if (text === "wellbeing") {
    return "wellness";
  }

  if (text && GOAL_TASK_TYPES.has(text)) {
    return text as OnboardingGoalTaskType;
  }

  return "general";
}

function normalizeMinimumDailyMinutes(value: unknown, label: string, warnings: string[]): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : 0;

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  const rounded = Math.round(numericValue);
  const clamped = Math.max(0, Math.min(720, rounded));

  if (clamped !== rounded) {
    warnings.push(`${label} was capped to ${clamped} minutes.`);
  }

  return clamped;
}

function normalizeProfile(value: unknown, warnings: string[]): OnboardingProfileDraft {
  const profile = asObject(value);
  if (!profile) {
    return {};
  }

  const workStartTime = normalizeTime(profile.workStartTime, "Work start time", warnings);
  const workEndTime = normalizeTime(profile.workEndTime, "Work end time", warnings);
  const noMeetingStartTime = normalizeTime(profile.noMeetingStartTime, "No-meeting start time", warnings);
  const noMeetingEndTime = normalizeTime(profile.noMeetingEndTime, "No-meeting end time", warnings);

  const focusBlockMinutes =
    typeof profile.focusBlockMinutes === "number" && Number.isFinite(profile.focusBlockMinutes)
      ? Math.max(15, Math.min(240, Math.round(profile.focusBlockMinutes / 5) * 5))
      : null;

  const workoutPreference =
    typeof profile.workoutPreference === "string" && WORKOUT_PREFERENCES.has(profile.workoutPreference)
      ? (profile.workoutPreference as OnboardingProfileDraft["workoutPreference"])
      : null;

  return {
    workStartTime,
    workEndTime,
    noMeetingStartTime,
    noMeetingEndTime,
    focusBlockMinutes,
    workoutPreference,
  };
}

function normalizeGoals(value: unknown, warnings: string[]): OnboardingGoalDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const goals: OnboardingGoalDraft[] = [];

  for (const [index, rawGoal] of value.entries()) {
    const goal = asObject(rawGoal);
    const title = optionalString(goal?.title);

    if (!goal || !title) {
      warnings.push(`Goal ${index + 1} was ignored because it did not include a title.`);
      continue;
    }

    goals.push({
      title: title.slice(0, 160),
      description: optionalString(goal.description)?.slice(0, 500) ?? null,
      priority: normalizePriority(goal.priority),
      taskType: normalizeGoalTaskType(goal.taskType),
      minimumDailyMinutes: normalizeMinimumDailyMinutes(
        goal.minimumDailyMinutes,
        `Goal ${index + 1} minimum daily minutes`,
        warnings,
      ),
      endDate: normalizeDate(goal.endDate, `Goal ${index + 1} end date`, warnings),
    });
  }

  return goals.slice(0, 8);
}

function normalizeDays(value: unknown): Array<0 | 1 | 2 | 3 | 4 | 5 | 6> {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value)]
    .filter((day): day is 0 | 1 | 2 | 3 | 4 | 5 | 6 => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
}

function normalizeScheduleBlocks(
  value: unknown,
  timezone: string,
  mode: NaturalLanguageOnboardingMode,
  warnings: string[],
): OnboardingScheduleBlockDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const blocks: OnboardingScheduleBlockDraft[] = [];

  for (const [index, rawBlock] of value.entries()) {
    const block = asObject(rawBlock);
    const title = optionalString(block?.title);
    const category = optionalString(block?.category);
    const daysOfWeek = normalizeDays(block?.daysOfWeek);
    const startTime = normalizeTime(block?.startTime, `Schedule block ${index + 1} start time`, warnings);
    const endTime = normalizeTime(block?.endTime, `Schedule block ${index + 1} end time`, warnings);

    if (!block || !title || !category || !CATEGORIES.has(category) || daysOfWeek.length === 0 || !startTime || !endTime) {
      warnings.push(`Schedule block ${index + 1} was ignored because it was incomplete.`);
      continue;
    }

    const normalizedCategory = category as OnboardingScheduleBlockDraft["category"];
    if (!MODE_CATEGORIES[mode].has(normalizedCategory)) {
      warnings.push(`Schedule block ${index + 1} was ignored because ${category} does not belong in this onboarding step.`);
      continue;
    }

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      warnings.push(`Schedule block ${index + 1} was ignored because the end time was not after the start time.`);
      continue;
    }

    blocks.push({
      title: title.slice(0, 120),
      category: normalizedCategory,
      daysOfWeek,
      startTime,
      endTime,
      timezone,
    });
  }

  return blocks.slice(0, 20);
}

export function validateNaturalLanguageOnboardingDraft(
  value: unknown,
  mode: NaturalLanguageOnboardingMode = "school_work",
  timezone = "America/Toronto",
): NaturalLanguageOnboardingDraft {
  const warnings: string[] = [];
  const parsed = asObject(value);

  if (!parsed) {
    throw new Error("Onboarding parser payload is not an object.");
  }

  const modelWarnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim())
    : [];

  return {
    profile: mode === "goals" ? {} : normalizeProfile(parsed.profile, warnings),
    goals: mode === "goals" ? normalizeGoals(parsed.goals, warnings) : [],
    scheduleBlocks: normalizeScheduleBlocks(parsed.scheduleBlocks, timezone, mode, warnings),
    warnings: [...modelWarnings.filter(Boolean), ...warnings],
  };
}

export async function parseNaturalLanguageOnboarding(
  input: ParseNaturalLanguageOnboardingInput,
): Promise<NaturalLanguageOnboardingDraft> {
  const text = input.text.trim();
  const mode = input.mode;
  const timezone = input.timezone ?? "America/Toronto";

  if (text.length < 12) {
    throw new Error("Add a little more context before parsing.");
  }

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Natural-language onboarding parser skipped: GEMINI_API_KEY not configured.");
      }

      return requestOnboardingParse({ text, mode, timezone });
    });

  const raw = await generate({ text, mode, timezone });
  return validateNaturalLanguageOnboardingDraft(raw, mode, timezone);
}
