// Habit Insights — pure metric + nudge types. Lives in @personal-agent/core so both
// the Next.js web app and the Expo mobile app compute identical habit analysis.

export type HabitWorkoutType = "strength" | "cardio" | "recovery" | "sport";
export type HabitWorkoutIntensity = "light" | "moderate" | "intense";
export type HabitPeriod = "daily" | "weekly";

/** A meal log row, narrowed to just the fields the engine reads. */
export type HabitMealLog = {
  logged_at: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
};

/** A workout log row, narrowed to the fields the engine reads. */
export type HabitWorkoutLog = {
  logged_at: string;
  workout_type: HabitWorkoutType;
  duration_minutes: number | null;
  intensity: HabitWorkoutIntensity;
};

/**
 * Explicit numeric targets, if the user has any. Derived by the caller from body
 * profile (`maintenance_calories`) or goals — the engine never invents targets.
 */
export type HabitTargets = {
  calorieTarget: number | null;
  proteinTarget: number | null;
};

/** Analysis window. `days` = 1 for a daily digest, 7 for a weekly review. */
export type HabitRange = {
  endDate: string; // local 'YYYY-MM-DD', inclusive last day
  days: number;
  timezone: string;
};

export type HabitMetricsInput = {
  meals: HabitMealLog[];
  workouts: HabitWorkoutLog[];
  targets: HabitTargets;
  range: HabitRange;
};

export type DayNutrition = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  mealCount: number;
};

export type DayWorkout = {
  date: string;
  sessions: number;
  minutes: number;
};

export type WorkoutTypeBalance = {
  strength: number;
  cardio: number;
  recovery: number;
  sport: number;
};

export type IntensityDistribution = {
  light: number;
  moderate: number;
  intense: number;
};

export type NutritionMetrics = {
  daysLogged: number;
  loggingConsistency: number; // 0..1 (daysLogged / range.days)
  avgCalories: number | null; // averaged over days that had at least one meal
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgFiber: number | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  calorieAdherenceDays: number | null; // days within ±15% of calorieTarget (null if no target)
  proteinTargetHitDays: number | null; // days protein >= target (null if no target)
  perDay: DayNutrition[];
};

export type WorkoutMetrics = {
  sessions: number;
  sessionsPerWeek: number;
  activeMinutes: number;
  daysWithWorkout: number;
  restDays: number;
  daysSinceLastWorkout: number | null; // null when no workout falls in the window
  typeBalance: WorkoutTypeBalance;
  intensityDistribution: IntensityDistribution;
  perDay: DayWorkout[];
};

export type HabitStreaks = {
  loggingStreak: number; // consecutive days (ending endDate) with any meal logged
  workoutStreak: number; // consecutive days (ending endDate) with a workout
  proteinTargetStreak: number; // consecutive days hitting protein target (0 without a target)
};

export type HabitMetrics = {
  range: { startDate: string; endDate: string; days: number };
  nutrition: NutritionMetrics;
  workouts: WorkoutMetrics;
  streaks: HabitStreaks;
};

export type HabitDigestImprovement = { area: string; suggestion: string };

/** The narrated summary rendered on the Analysis page (LLM- or deterministically built). */
export type HabitDigest = {
  headline: string;
  endorsements: string[];
  improvements: HabitDigestImprovement[];
  summary: string;
};

export type NudgeTone = "positive" | "improve";

export type Nudge = {
  id: string;
  tone: NudgeTone;
  metric: string;
  message: string;
};

export type NudgeOptions = {
  /** Bias ordering toward nudges relevant to what was just logged. */
  focus?: "meal" | "workout";
  /** Cap the number returned (positive-first, then improvements). */
  limit?: number;
};
