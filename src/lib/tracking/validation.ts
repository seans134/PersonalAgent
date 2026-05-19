import type {
  BodyProfileLogInput,
  MealLogInput,
  MealLogUpdateInput,
  MealType,
  WorkoutIntensity,
  WorkoutLogInput,
  WorkoutType,
} from "./types";

const MEAL_TYPES = new Set<MealType>(["breakfast", "lunch", "dinner", "snack", "meal"]);
const WORKOUT_TYPES = new Set<WorkoutType>(["strength", "cardio", "mobility", "sport", "walk", "other"]);
const WORKOUT_INTENSITIES = new Set<WorkoutIntensity>(["light", "moderate", "intense"]);

function requiredText(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function optionalNonNegativeNumber(formData: FormData, key: string, label: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return value;
}

function optionalNonNegativeInteger(formData: FormData, key: string, label: string) {
  const value = optionalNonNegativeNumber(formData, key, label);
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return value;
}

function optionalPositiveNumber(formData: FormData, key: string, label: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return value;
}

function requiredIntegerInRange(formData: FormData, key: string, label: string, min: number, max: number) {
  const raw = String(formData.get(key) ?? "").trim();
  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }

  return value;
}

function optionalLoggedAt(formData: FormData) {
  const raw = String(formData.get("logged_at") ?? "").trim();
  if (!raw) {
    return new Date().toISOString();
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Logged time must be a valid date/time.");
  }

  return date.toISOString();
}

export function parseMealLogFormData(formData: FormData): MealLogInput {
  const mealTypeRaw = String(formData.get("meal_type") ?? "meal").trim();
  const mealType = MEAL_TYPES.has(mealTypeRaw as MealType) ? (mealTypeRaw as MealType) : "meal";

  return {
    logged_at: optionalLoggedAt(formData),
    meal_type: mealType,
    name: requiredText(formData, "name", "Meal name"),
    calories: optionalNonNegativeInteger(formData, "calories", "Calories"),
    protein_grams: optionalNonNegativeNumber(formData, "protein_grams", "Protein"),
    carbs_grams: optionalNonNegativeNumber(formData, "carbs_grams", "Carbs"),
    fat_grams: optionalNonNegativeNumber(formData, "fat_grams", "Fat"),
    notes: optionalText(formData, "notes"),
  };
}

export function parseMealLogUpdateFormData(formData: FormData): MealLogUpdateInput {
  return {
    name: requiredText(formData, "name", "Meal name"),
    calories: optionalNonNegativeInteger(formData, "calories", "Calories"),
    protein_grams: optionalNonNegativeNumber(formData, "protein_grams", "Protein"),
    carbs_grams: optionalNonNegativeNumber(formData, "carbs_grams", "Carbs"),
    fat_grams: optionalNonNegativeNumber(formData, "fat_grams", "Fat"),
    notes: optionalText(formData, "notes"),
  };
}

export function parseWorkoutLogFormData(formData: FormData): WorkoutLogInput {
  const workoutTypeRaw = String(formData.get("workout_type") ?? "other").trim();
  const intensityRaw = String(formData.get("intensity") ?? "moderate").trim();

  const workoutType = WORKOUT_TYPES.has(workoutTypeRaw as WorkoutType)
    ? (workoutTypeRaw as WorkoutType)
    : "other";
  const intensity = WORKOUT_INTENSITIES.has(intensityRaw as WorkoutIntensity)
    ? (intensityRaw as WorkoutIntensity)
    : "moderate";

  return {
    logged_at: optionalLoggedAt(formData),
    workout_type: workoutType,
    title: requiredText(formData, "title", "Workout title"),
    duration_minutes: requiredIntegerInRange(formData, "duration_minutes", "Duration", 1, 1440),
    intensity,
    calories_burned: optionalNonNegativeInteger(formData, "calories_burned", "Calories burned"),
    notes: optionalText(formData, "notes"),
  };
}

export function parseBodyProfileLogFormData(formData: FormData): BodyProfileLogInput {
  const heightCm = optionalPositiveNumber(formData, "height_cm", "Height");
  const weightKg = optionalPositiveNumber(formData, "weight_kg", "Weight");
  const bodyFatPercentage = optionalNonNegativeNumber(formData, "body_fat_percentage", "Body fat percentage");
  const maintenanceCalories = optionalNonNegativeInteger(formData, "maintenance_calories", "Maintenance calories");

  if (bodyFatPercentage !== null && bodyFatPercentage > 100) {
    throw new Error("Body fat percentage must be between 0 and 100.");
  }

  if (
    heightCm === null &&
    weightKg === null &&
    bodyFatPercentage === null &&
    maintenanceCalories === null
  ) {
    throw new Error("Add at least one body profile metric.");
  }

  return {
    logged_at: optionalLoggedAt(formData),
    height_cm: heightCm,
    weight_kg: weightKg,
    body_fat_percentage: bodyFatPercentage,
    maintenance_calories: maintenanceCalories,
    notes: optionalText(formData, "notes"),
  };
}
