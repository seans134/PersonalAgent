export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "meal";

export type WorkoutType = "strength" | "cardio" | "mobility" | "sport" | "walk" | "other";

export type WorkoutIntensity = "light" | "moderate" | "intense";

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
  title: string;
  duration_minutes: number;
  intensity: WorkoutIntensity;
  calories_burned: number | null;
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
};
