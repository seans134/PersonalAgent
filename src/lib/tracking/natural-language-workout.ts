import { isGeminiConfigured, requestWorkoutLogParse, requestWorkoutScheduleParse } from "@/lib/gemini/client";
import type {
  WorkoutIntensity,
  WorkoutLogInput,
  WorkoutMetrics,
  WorkoutScheduleItemInput,
  WorkoutTrackingMethod,
  WorkoutType,
} from "./types";

export type NaturalLanguageWorkoutDraft = WorkoutLogInput & {
  warnings: string[];
};

export type ParseNaturalLanguageWorkoutInput = {
  text: string;
  timezone?: string;
  generateOutput?: (input: { text: string; timezone: string }) => Promise<unknown>;
};

export type NaturalLanguageWorkoutScheduleDraft = {
  items: WorkoutScheduleItemInput[];
  warnings: string[];
};

export type ParseNaturalLanguageWorkoutScheduleInput = {
  text: string;
  timezone?: string;
  generateOutput?: (input: { text: string; timezone: string }) => Promise<unknown>;
};

const WORKOUT_TYPES = new Set<WorkoutType>(["strength", "cardio", "recovery", "sport"]);
const WORKOUT_INTENSITIES = new Set<WorkoutIntensity>(["light", "moderate", "intense"]);
const WORKOUT_METHODS_BY_TYPE: Record<WorkoutType, WorkoutTrackingMethod[]> = {
  strength: ["sets_reps_weight", "bodyweight_sets"],
  cardio: ["distance_time", "time_only", "intervals"],
  recovery: ["mobility_flow", "stretching", "breathwork"],
  sport: ["game", "practice", "skills"],
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

function optionalNonNegativeInteger(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    warnings.push(`${label} was ignored because it was not a non-negative whole number.`);
    return null;
  }

  return value;
}

function optionalPositiveInteger(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    warnings.push(`${label} was ignored because it was not a positive whole number.`);
    return null;
  }

  return value;
}

function optionalNonNegativeNumber(value: unknown, label: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    warnings.push(`${label} was ignored because it was not a non-negative number.`);
    return null;
  }

  return value;
}

function normalizeLoggedAt(value: unknown, warnings: string[]): string {
  const text = optionalString(value);
  if (!text) {
    return new Date().toISOString();
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    warnings.push("Logged time was ignored because it was not a valid date/time.");
    return new Date().toISOString();
  }

  return date.toISOString();
}

function normalizeType(value: unknown): WorkoutType {
  return typeof value === "string" && WORKOUT_TYPES.has(value as WorkoutType) ? (value as WorkoutType) : "strength";
}

function normalizeMethod(value: unknown, workoutType: WorkoutType): WorkoutTrackingMethod {
  const validMethods = WORKOUT_METHODS_BY_TYPE[workoutType];
  return typeof value === "string" && validMethods.includes(value as WorkoutTrackingMethod)
    ? (value as WorkoutTrackingMethod)
    : validMethods[0];
}

function normalizeIntensity(value: unknown): WorkoutIntensity {
  return typeof value === "string" && WORKOUT_INTENSITIES.has(value as WorkoutIntensity)
    ? (value as WorkoutIntensity)
    : "moderate";
}

function normalizeMetrics(value: unknown, method: WorkoutTrackingMethod, warnings: string[]): WorkoutMetrics {
  const metrics = asObject(value) ?? {};

  switch (method) {
    case "sets_reps_weight":
      return {
        exercise_name: optionalString(metrics.exercise_name),
        sets: optionalPositiveInteger(metrics.sets, "Sets", warnings),
        reps: optionalPositiveInteger(metrics.reps, "Reps", warnings),
        weight: optionalNonNegativeNumber(metrics.weight, "Weight", warnings),
        weight_unit: optionalString(metrics.weight_unit) ?? "lb",
      };
    case "bodyweight_sets":
      return {
        exercise_name: optionalString(metrics.exercise_name),
        sets: optionalPositiveInteger(metrics.sets, "Sets", warnings),
        reps: optionalPositiveInteger(metrics.reps, "Reps", warnings),
      };
    case "distance_time":
      return {
        distance: optionalNonNegativeNumber(metrics.distance, "Distance", warnings),
        distance_unit: optionalString(metrics.distance_unit) ?? "mi",
      };
    case "intervals":
      return {
        intervals: optionalPositiveInteger(metrics.intervals, "Intervals", warnings),
        work_seconds: optionalPositiveInteger(metrics.work_seconds, "Work interval", warnings),
        rest_seconds: optionalPositiveInteger(metrics.rest_seconds, "Rest interval", warnings),
      };
    case "mobility_flow":
    case "stretching":
      return {
        focus_area: optionalString(metrics.focus_area),
      };
    case "breathwork":
      return {
        rounds: optionalPositiveInteger(metrics.rounds, "Rounds", warnings),
      };
    case "game":
      return {
        sport_name: optionalString(metrics.sport_name),
        result: optionalString(metrics.result),
      };
    case "practice":
      return {
        sport_name: optionalString(metrics.sport_name),
        drill: optionalString(metrics.drill),
      };
    case "skills":
      return {
        sport_name: optionalString(metrics.sport_name),
        skill: optionalString(metrics.skill),
      };
    case "time_only":
    default:
      return {};
  }
}

function normalizeDayOfWeek(value: unknown, label: string, warnings: string[]): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 7) {
    warnings.push(`${label} was ignored because it was not a valid weekday.`);
    return null;
  }

  return value;
}

function normalizeScheduleDuration(value: unknown, method: WorkoutTrackingMethod, warnings: string[]): number | null {
  if (method === "sets_reps_weight") {
    return null;
  }

  const duration = optionalPositiveInteger(value, "Duration", warnings);
  return duration ? Math.min(duration, 1440) : null;
}

export function validateNaturalLanguageWorkoutDraft(value: unknown): NaturalLanguageWorkoutDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Workout parser payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim())
    : [];

  const workoutType = normalizeType(parsed.workout_type);
  const trackingMethod = normalizeMethod(parsed.tracking_method, workoutType);
  const title = optionalString(parsed.title);
  const durationMinutes = optionalPositiveInteger(parsed.duration_minutes, "Duration", warnings);

  if (!title) {
    throw new Error("Workout title is required.");
  }

  if (!durationMinutes) {
    throw new Error("Duration is required.");
  }

  return {
    logged_at: normalizeLoggedAt(parsed.logged_at, warnings),
    workout_type: workoutType,
    tracking_method: trackingMethod,
    title: title.slice(0, 160),
    duration_minutes: Math.min(durationMinutes, 1440),
    intensity: normalizeIntensity(parsed.intensity),
    calories_burned: optionalNonNegativeInteger(parsed.calories_burned, "Calories burned", warnings),
    metrics: normalizeMetrics(parsed.metrics, trackingMethod, warnings),
    notes: optionalString(parsed.notes)?.slice(0, 500) ?? null,
    warnings: warnings.filter(Boolean),
  };
}

export async function parseNaturalLanguageWorkout(
  input: ParseNaturalLanguageWorkoutInput,
): Promise<NaturalLanguageWorkoutDraft> {
  const text = input.text.trim();
  const timezone = input.timezone ?? "America/Toronto";

  if (text.length < 8) {
    throw new Error("Add a little more workout detail before parsing.");
  }

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Workout parser skipped: GEMINI_API_KEY not configured.");
      }

      return requestWorkoutLogParse({ text, timezone });
    });

  const raw = await generate({ text, timezone });
  return validateNaturalLanguageWorkoutDraft(raw);
}

export function validateNaturalLanguageWorkoutScheduleDraft(value: unknown): NaturalLanguageWorkoutScheduleDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Workout schedule parser payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim())
    : [];

  if (!Array.isArray(parsed.items)) {
    throw new Error("Workout schedule parser payload must include items.");
  }

  const items = parsed.items.flatMap((rawItem, index): WorkoutScheduleItemInput[] => {
    const item = asObject(rawItem);
    if (!item) {
      warnings.push(`Workout ${index + 1} was ignored because it was not an object.`);
      return [];
    }

    const dayOfWeek = normalizeDayOfWeek(item.day_of_week, `Workout ${index + 1} day`, warnings);
    const workoutType = normalizeType(item.workout_type);
    const trackingMethod = normalizeMethod(item.tracking_method, workoutType);
    const title = optionalString(item.title);

    if (!dayOfWeek || !title) {
      warnings.push(`Workout ${index + 1} was ignored because it was missing a day or title.`);
      return [];
    }

    return [
      {
        day_of_week: dayOfWeek,
        workout_type: workoutType,
        tracking_method: trackingMethod,
        title: title.slice(0, 160),
        duration_minutes: normalizeScheduleDuration(item.duration_minutes, trackingMethod, warnings),
        metrics: normalizeMetrics(item.metrics, trackingMethod, warnings),
        notes: optionalString(item.notes)?.slice(0, 500) ?? null,
      },
    ];
  });

  return {
    items: items.slice(0, 14),
    warnings: warnings.filter(Boolean),
  };
}

export async function parseNaturalLanguageWorkoutSchedule(
  input: ParseNaturalLanguageWorkoutScheduleInput,
): Promise<NaturalLanguageWorkoutScheduleDraft> {
  const text = input.text.trim();
  const timezone = input.timezone ?? "America/Toronto";

  if (text.length < 8) {
    throw new Error("Add a little more workout plan detail before parsing.");
  }

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Workout schedule parser skipped: GEMINI_API_KEY not configured.");
      }

      return requestWorkoutScheduleParse({ text, timezone });
    });

  const raw = await generate({ text, timezone });
  return validateNaturalLanguageWorkoutScheduleDraft(raw);
}
