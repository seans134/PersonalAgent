import type {
  DayNutrition,
  DayWorkout,
  HabitMetrics,
  HabitMetricsInput,
  IntensityDistribution,
  WorkoutTypeBalance,
} from "./types";

const CALORIE_ADHERENCE_BAND = 0.15; // ±15% of target counts as "on target"

/** Formats an instant as a local calendar date ('YYYY-MM-DD') in the given zone. */
export function localDateKey(iso: string, timezone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Shifts a 'YYYY-MM-DD' calendar date by whole days, staying in UTC to dodge DST. */
export function shiftDate(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  const base = Date.UTC(year, month - 1, day);
  const shifted = new Date(base + deltaDays * 24 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = (shifted.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = shifted.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Enumerates the window's day keys, oldest first, ending at `endDate` inclusive. */
export function enumerateDays(endDate: string, days: number): string[] {
  const count = Math.max(1, Math.floor(days));
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    result.push(shiftDate(endDate, -offset));
  }
  return result;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function num(value: unknown): number {
  // Postgres `numeric` columns can arrive as strings via supabase-js, so coerce.
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reduces raw meal/workout logs into a per-day, aggregate, and streak snapshot. Pure —
 * no I/O, no clock reads beyond parsing the ISO strings it is given.
 */
export function computeHabitMetrics(input: HabitMetricsInput): HabitMetrics {
  const { meals, workouts, targets, range } = input;
  const { timezone } = range;
  const days = enumerateDays(range.endDate, range.days);

  const nutritionByDay = new Map<string, DayNutrition>();
  const workoutByDay = new Map<string, DayWorkout>();
  for (const date of days) {
    nutritionByDay.set(date, {
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      mealCount: 0,
    });
    workoutByDay.set(date, { date, sessions: 0, minutes: 0 });
  }

  for (const meal of meals) {
    const key = localDateKey(meal.logged_at, timezone);
    if (!key || !nutritionByDay.has(key)) {
      continue;
    }
    const bucket = nutritionByDay.get(key)!;
    bucket.calories += num(meal.calories);
    bucket.protein += num(meal.protein_grams);
    bucket.carbs += num(meal.carbs_grams);
    bucket.fat += num(meal.fat_grams);
    bucket.fiber += num(meal.fiber_grams);
    bucket.mealCount += 1;
  }

  const typeBalance: WorkoutTypeBalance = { strength: 0, cardio: 0, recovery: 0, sport: 0 };
  const intensityDistribution: IntensityDistribution = { light: 0, moderate: 0, intense: 0 };
  let activeMinutes = 0;

  for (const workout of workouts) {
    const key = localDateKey(workout.logged_at, timezone);
    if (!key || !workoutByDay.has(key)) {
      continue;
    }
    const bucket = workoutByDay.get(key)!;
    bucket.sessions += 1;
    bucket.minutes += num(workout.duration_minutes);
    activeMinutes += num(workout.duration_minutes);
    if (workout.workout_type in typeBalance) {
      typeBalance[workout.workout_type] += 1;
    }
    if (workout.intensity in intensityDistribution) {
      intensityDistribution[workout.intensity] += 1;
    }
  }

  const perDayNutrition = days.map((date) => nutritionByDay.get(date)!);
  const perDayWorkout = days.map((date) => workoutByDay.get(date)!);

  const loggedDays = perDayNutrition.filter((day) => day.mealCount > 0);
  const daysLogged = loggedDays.length;
  const average = (selector: (day: DayNutrition) => number): number | null =>
    daysLogged > 0 ? round(loggedDays.reduce((sum, day) => sum + selector(day), 0) / daysLogged) : null;

  const calorieTarget = targets.calorieTarget;
  const proteinTarget = targets.proteinTarget;

  const calorieAdherenceDays =
    calorieTarget && calorieTarget > 0
      ? loggedDays.filter(
          (day) => Math.abs(day.calories - calorieTarget) <= calorieTarget * CALORIE_ADHERENCE_BAND,
        ).length
      : null;
  const proteinTargetHitDays =
    proteinTarget && proteinTarget > 0
      ? loggedDays.filter((day) => day.protein >= proteinTarget).length
      : null;

  const sessions = perDayWorkout.reduce((sum, day) => sum + day.sessions, 0);
  const daysWithWorkout = perDayWorkout.filter((day) => day.sessions > 0).length;

  // Days since last workout: walk backward from endDate.
  let daysSinceLastWorkout: number | null = null;
  for (let offset = 0; offset < perDayWorkout.length; offset += 1) {
    const day = perDayWorkout[perDayWorkout.length - 1 - offset];
    if (day.sessions > 0) {
      daysSinceLastWorkout = offset;
      break;
    }
  }

  const streakFrom = (hasActivity: (index: number) => boolean, total: number): number => {
    let streak = 0;
    for (let offset = 0; offset < total; offset += 1) {
      if (hasActivity(total - 1 - offset)) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  };

  const loggingStreak = streakFrom((i) => perDayNutrition[i].mealCount > 0, days.length);
  const workoutStreak = streakFrom((i) => perDayWorkout[i].sessions > 0, days.length);
  const proteinTargetStreak =
    proteinTarget && proteinTarget > 0
      ? streakFrom(
          (i) => perDayNutrition[i].mealCount > 0 && perDayNutrition[i].protein >= proteinTarget,
          days.length,
        )
      : 0;

  return {
    range: { startDate: days[0], endDate: days[days.length - 1], days: days.length },
    nutrition: {
      daysLogged,
      loggingConsistency: round(daysLogged / days.length, 2),
      avgCalories: average((day) => day.calories),
      avgProtein: average((day) => day.protein),
      avgCarbs: average((day) => day.carbs),
      avgFat: average((day) => day.fat),
      avgFiber: average((day) => day.fiber),
      calorieTarget,
      proteinTarget,
      calorieAdherenceDays,
      proteinTargetHitDays,
      perDay: perDayNutrition,
    },
    workouts: {
      sessions,
      sessionsPerWeek: round((sessions / days.length) * 7),
      activeMinutes,
      daysWithWorkout,
      restDays: days.length - daysWithWorkout,
      daysSinceLastWorkout,
      typeBalance,
      intensityDistribution,
      perDay: perDayWorkout,
    },
    streaks: {
      loggingStreak,
      workoutStreak,
      proteinTargetStreak,
    },
  };
}
