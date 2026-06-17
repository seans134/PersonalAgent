import type { TodayPlanResponse } from "@personal-agent/core/planner/client-types";
import { requireMobileEnv } from "./env";

type BackendSessionResponse =
  | {
      ok: true;
      user: {
        id: string;
        email: string | null;
      };
    }
  | {
      ok: false;
      error: string;
    };

export type MobileOnboardingInput = {
  workStartTime: string;
  workEndTime: string;
  focusBlockMinutes: number;
  workoutPreference: "none" | "light" | "moderate" | "intense";
  goalTitle: string;
  goalDescription?: string;
  goalPriority: 1 | 2 | 3;
  goalTaskType: "general" | "focus" | "fitness" | "wellness" | "admin";
  minimumDailyMinutes: number;
};

export type MobileTodayPlanResponse = TodayPlanResponse;

export type MobileCalendarCategory = "school" | "work" | "study" | "personal" | "unavailable";

export type MobileCalendarVisibility = Record<MobileCalendarCategory, boolean>;

export type MobileScheduleBlock = {
  id: string;
  title: string;
  category: MobileCalendarCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  timezone?: string;
};

export type MobileCalendarEvent = {
  id: string;
  title: string;
  category: MobileCalendarCategory;
  date: string;
  startTime: string;
  endTime: string;
  source: "manual";
};

export type MobileCalendarResponse = {
  visibility: MobileCalendarVisibility;
  scheduleBlocks: MobileScheduleBlock[];
  events: MobileCalendarEvent[];
};

export type MobileMealInput = {
  id?: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack" | "meal";
  name: string;
  calories?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  fiberGrams?: number | null;
  notes?: string | null;
};

export type MobileMealLog = {
  id: string;
  logged_at: string;
  meal_type: string;
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

export type MobileSavedMeal = {
  id: string;
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
};

export type MobileGoalInput = {
  id?: string;
  title: string;
  description?: string | null;
  priority: 1 | 2 | 3;
  taskType: "general" | "focus" | "fitness" | "wellness" | "admin";
  minimumDailyMinutes: number;
  endDate?: string | null;
};

export type MobileGoal = {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  task_type: string;
  minimum_daily_minutes: number | null;
  end_date: string | null;
  completed_at: string | null;
  created_at: string;
};

export type MobileWorkoutType = "strength" | "cardio" | "recovery" | "sport";

export type MobileWorkoutIntensity = "light" | "moderate" | "intense";

export type MobileWorkoutTrackingMethod =
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

export type MobileWorkoutMetrics = Record<string, string | number | null>;

export type MobileWorkoutInput = {
  workoutType: MobileWorkoutType;
  trackingMethod: MobileWorkoutTrackingMethod;
  title: string;
  durationMinutes?: number | null;
  intensity: MobileWorkoutIntensity;
  caloriesBurned?: number | null;
  metrics?: MobileWorkoutMetrics;
  notes?: string | null;
};

export type MobileWorkoutLog = {
  id: string;
  source_schedule_item_id: string | null;
  logged_at: string;
  workout_type: MobileWorkoutType;
  tracking_method: MobileWorkoutTrackingMethod;
  title: string;
  duration_minutes: number | null;
  intensity: MobileWorkoutIntensity;
  calories_burned: number | null;
  metrics: MobileWorkoutMetrics | null;
  notes: string | null;
};

export type MobilePlannedWorkout = {
  id: string;
  day_of_week?: number;
  position?: number;
  workout_type: MobileWorkoutType;
  tracking_method: MobileWorkoutTrackingMethod;
  title: string;
  duration_minutes: number | null;
  metrics: MobileWorkoutMetrics | null;
  notes: string | null;
};

export type MobileWorkoutScheduleItem = MobilePlannedWorkout & {
  day_of_week: number;
  position: number;
};

export type MobileWorkoutScheduleInput = {
  dayOfWeek: number;
  workoutType: MobileWorkoutType;
  trackingMethod: MobileWorkoutTrackingMethod;
  title: string;
  durationMinutes?: number | null;
  metrics?: MobileWorkoutMetrics;
  notes?: string | null;
};

export async function fetchBackendSession(accessToken: string): Promise<BackendSessionResponse> {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/session`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json()) as BackendSessionResponse;

  if (!response.ok && "error" in body) {
    return body;
  }

  return body;
}

export async function saveMobileOnboarding(accessToken: string, input: MobileOnboardingInput) {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/onboarding`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { error?: string; profileUpdated?: boolean; goalsCreated?: number };

  if (!response.ok) {
    throw new Error(body.error ?? "Unable to save onboarding.");
  }

  return body;
}

export async function generateMobileTodayPlan(accessToken: string): Promise<MobileTodayPlanResponse> {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/plan/today`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await response.json()) as MobileTodayPlanResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in body && body.error ? body.error : "Unable to generate today plan.");
  }

  return body as MobileTodayPlanResponse;
}

export async function fetchMobileCalendar(accessToken: string): Promise<MobileCalendarResponse> {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/mobile/calendar`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json()) as MobileCalendarResponse | { error?: string };

  if (!response.ok) {
    throw new Error("error" in body && body.error ? body.error : "Unable to load calendar.");
  }

  return body as MobileCalendarResponse;
}

async function fetchJson<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = body as { error?: string };
    throw new Error(errorBody.error ?? "Request failed.");
  }

  return body as T;
}

export async function fetchMobileMeals(accessToken: string) {
  return fetchJson<{ meals: MobileMealLog[] }>("/api/mobile/meals", accessToken);
}

export async function createMobileMeal(accessToken: string, input: MobileMealInput) {
  return fetchJson<{ meal: MobileMealLog }>("/api/mobile/meals", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMobileMeal(accessToken: string, input: MobileMealInput & { id: string }) {
  return fetchJson<{ meal: MobileMealLog }>("/api/mobile/meals", accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMobileMeal(accessToken: string, id: string) {
  return fetchJson<{ ok: true }>("/api/mobile/meals", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function fetchMobileSavedMeals(accessToken: string) {
  return fetchJson<{ savedMeals: MobileSavedMeal[] }>("/api/mobile/meals/saved", accessToken);
}

export async function createMobileSavedMeal(accessToken: string, input: MobileMealInput) {
  return fetchJson<{ savedMeal: MobileSavedMeal }>("/api/mobile/meals/saved", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMobileSavedMeal(accessToken: string, input: MobileMealInput & { id: string }) {
  return fetchJson<{ savedMeal: MobileSavedMeal }>("/api/mobile/meals/saved", accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteMobileSavedMeal(accessToken: string, id: string) {
  return fetchJson<{ ok: true }>("/api/mobile/meals/saved", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function trackMobileSavedMeal(accessToken: string, id: string) {
  return fetchJson<{ meal: MobileMealLog }>("/api/mobile/meals/saved", accessToken, {
    method: "PUT",
    body: JSON.stringify({ id }),
  });
}

export async function fetchMobileGoals(accessToken: string) {
  return fetchJson<{ activeGoals: MobileGoal[]; completedGoals: MobileGoal[] }>("/api/mobile/goals", accessToken);
}

export async function createMobileGoal(accessToken: string, input: MobileGoalInput) {
  return fetchJson<{ goal: MobileGoal }>("/api/mobile/goals", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateMobileGoal(accessToken: string, input: MobileGoalInput & { id: string }) {
  return fetchJson<{ goal: MobileGoal }>("/api/mobile/goals", accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function setMobileGoalCompleted(accessToken: string, id: string, completed: boolean) {
  return fetchJson<{ goal: MobileGoal }>("/api/mobile/goals", accessToken, {
    method: "PATCH",
    body: JSON.stringify({ id, completed }),
  });
}

export async function deleteMobileGoal(accessToken: string, id: string) {
  return fetchJson<{ ok: true }>("/api/mobile/goals", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function fetchMobileWorkouts(accessToken: string) {
  return fetchJson<{ workouts: MobileWorkoutLog[]; plannedWorkouts: MobilePlannedWorkout[] }>(
    "/api/mobile/workouts",
    accessToken,
  );
}

export async function createMobileWorkout(accessToken: string, input: MobileWorkoutInput) {
  return fetchJson<{ workout: MobileWorkoutLog }>("/api/mobile/workouts", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function trackMobilePlannedWorkout(accessToken: string, scheduleItemId: string) {
  return fetchJson<{ workout: MobileWorkoutLog }>("/api/mobile/workouts", accessToken, {
    method: "PUT",
    body: JSON.stringify({ scheduleItemId }),
  });
}

export async function deleteMobileWorkout(accessToken: string, id: string) {
  return fetchJson<{ ok: true }>("/api/mobile/workouts", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function fetchMobileWorkoutPlan(accessToken: string) {
  return fetchJson<{ scheduleItems: MobileWorkoutScheduleItem[] }>("/api/mobile/workouts/plan", accessToken);
}

export async function createMobileWorkoutPlanItem(accessToken: string, input: MobileWorkoutScheduleInput) {
  return fetchJson<{ scheduleItem: MobileWorkoutScheduleItem }>("/api/mobile/workouts/plan", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteMobileWorkoutPlanItem(accessToken: string, id: string) {
  return fetchJson<{ ok: true }>("/api/mobile/workouts/plan", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}
