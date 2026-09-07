import type { Nudge } from "@personal-agent/core";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "meal";

export type WorkoutType = "strength" | "cardio" | "recovery" | "sport";

export type WorkoutIntensity = "light" | "moderate" | "intense";

export type WorkoutTrackingMethod =
  | "sets_reps_weight"
  | "bodyweight_sets"
  | "distance_time"
  | "time_only"
  | "intervals"
  | "mobility_flow"
  | "stretching"
  | "breathwork"
  | "game"
  | "practice"
  | "skills";

export type WorkoutMetrics = Record<string, string | number | null>;

export type MealLogInput = {
  logged_at: string;
  meal_type: MealType;
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

export type MealLogUpdateInput = {
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

export type SavedMealInput = MealLogUpdateInput;

export type WorkoutLogInput = {
  logged_at: string;
  workout_type: WorkoutType;
  tracking_method: WorkoutTrackingMethod;
  title: string;
  duration_minutes: number;
  intensity: WorkoutIntensity;
  calories_burned: number | null;
  metrics: WorkoutMetrics;
  notes: string | null;
};

export type WorkoutScheduleItemInput = {
  day_of_week: number;
  workout_type: WorkoutType;
  tracking_method: WorkoutTrackingMethod;
  title: string;
  duration_minutes: number | null;
  metrics: WorkoutMetrics;
  notes: string | null;
};

export type BodyProfileLogInput = {
  logged_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  maintenance_calories: number | null;
  notes: string | null;
};

export type TrackingActionResult = {
  ok: boolean;
  error?: string;
  nudges?: Nudge[];
};
