import type { TodayPlanResponse } from "@personal-agent/core/planner/client-types";
import { captureEvent, captureException } from "./analytics";
import { requireMobileEnv } from "./env";

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

export type MobileCalendarEventInput = {
  id?: string;
  kind: "event";
  title: string;
  category: MobileCalendarCategory;
  date: string;
  startTime: string;
  endTime: string;
};

export type MobileScheduleBlockInput = {
  id?: string;
  kind: "block";
  title: string;
  category: MobileCalendarCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  timezone?: string;
};

export type MobileCalendarItemInput = MobileCalendarEventInput | MobileScheduleBlockInput;

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

type MobileMealDraftBase = {
  name: string;
  calories: number | null;
  protein_grams: number | null;
  carbs_grams: number | null;
  fat_grams: number | null;
  fiber_grams: number | null;
  notes: string | null;
  warnings: string[];
};

export type MobileMealLogDraft = MobileMealDraftBase & {
  mode: "log";
  logged_at: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack" | "meal";
};

export type MobileSavedMealDraft = MobileMealDraftBase & {
  mode: "saved";
};

export type MobileMealDraft = MobileMealLogDraft | MobileSavedMealDraft;

export type MobileMealSuggestionDraft = MobileMealLogDraft & {
  suggestion_reason: string;
  suggested_timing: string | null;
  target_alignment: string | null;
  agent_reply: string | null;
};

export type MobileMealSuggestionResponse = {
  agent_reply: string;
  draft: MobileMealSuggestionDraft | null;
  warnings: string[];
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

export type MobileWorkoutDraft = {
  logged_at: string;
  workout_type: MobileWorkoutType;
  tracking_method: MobileWorkoutTrackingMethod;
  title: string;
  duration_minutes: number;
  intensity: MobileWorkoutIntensity;
  calories_burned: number | null;
  metrics: MobileWorkoutMetrics;
  notes: string | null;
  warnings: string[];
};

export type MobileWorkoutSuggestionDraft = MobileWorkoutDraft & {
  suggestion_reason: string;
  suggested_timing: string | null;
  target_alignment: string | null;
  agent_reply: string | null;
};

export type MobileWorkoutSuggestionResponse = {
  agent_reply: string;
  draft: MobileWorkoutSuggestionDraft | null;
  warnings: string[];
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

export type MobileWorkoutScheduleDraftItem = {
  day_of_week: number;
  workout_type: MobileWorkoutType;
  tracking_method: MobileWorkoutTrackingMethod;
  title: string;
  duration_minutes: number | null;
  metrics: MobileWorkoutMetrics;
  notes: string | null;
};

export type MobileWorkoutScheduleDraft = {
  items: MobileWorkoutScheduleDraftItem[];
  warnings: string[];
};

export async function deleteMobileAccount(accessToken: string) {
  return fetchJson<{ deleted: true }>("/api/mobile/account", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
}

export async function saveMobileOnboarding(accessToken: string, input: MobileOnboardingInput) {
  const body = await fetchJson<{ profileUpdated?: boolean; goalsCreated?: number }>(
    "/api/mobile/onboarding",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
    "Unable to save onboarding.",
  );
  captureEvent("onboarding_completed", { goals_created: body.goalsCreated ?? 0 });
  return body;
}

export async function generateMobileTodayPlan(accessToken: string): Promise<MobileTodayPlanResponse> {
  const body = await fetchJson<MobileTodayPlanResponse>(
    "/api/mobile/plan/today",
    accessToken,
    { method: "POST" },
    "Unable to generate today plan.",
  );
  captureEvent("plan_generated");
  return body;
}

export async function fetchMobileCalendar(accessToken: string): Promise<MobileCalendarResponse> {
  return fetchJson<MobileCalendarResponse>(
    "/api/mobile/calendar",
    accessToken,
    { method: "GET" },
    "Unable to load calendar.",
  );
}

async function fetchJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  fallbackError = "Request failed.",
): Promise<T> {
  const { apiBaseUrl } = requireMobileEnv();
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (proxy error page, empty body); fall through to status handling.
  }

  if (!response.ok) {
    const errorBody = body as { error?: string } | null;
    const error = new Error(errorBody?.error ?? `${fallbackError} (status ${response.status})`);
    captureEvent("api_request_failed", { path, status: response.status });
    if (response.status >= 500) captureException(error, { path, status: response.status });
    throw error;
  }

  if (body === null) {
    const error = new Error(fallbackError);
    captureException(error, { path, status: response.status, reason: "non_json_success_body" });
    throw error;
  }

  return body as T;
}

export async function createMobileCalendarItem(accessToken: string, input: MobileCalendarItemInput) {
  const response = await fetchJson<{ event?: MobileCalendarEvent; scheduleBlock?: MobileScheduleBlock }>(
    "/api/mobile/calendar",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
  );
  captureEvent("calendar_item_created", { kind: input.kind, category: input.category });
  return response;
}

export async function updateMobileCalendarItem(
  accessToken: string,
  input: MobileCalendarItemInput & { id: string },
) {
  const response = await fetchJson<{ event?: MobileCalendarEvent; scheduleBlock?: MobileScheduleBlock }>(
    "/api/mobile/calendar",
    accessToken,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  captureEvent("calendar_item_updated", { kind: input.kind, category: input.category });
  return response;
}

export async function deleteMobileCalendarItem(accessToken: string, kind: "event" | "block", id: string) {
  const response = await fetchJson<{ ok: true }>("/api/mobile/calendar", accessToken, {
    method: "DELETE",
    body: JSON.stringify({ kind, id }),
  });
  captureEvent("calendar_item_deleted", { kind });
  return response;
}

export async function fetchMobileMeals(accessToken: string) {
  return fetchJson<{ meals: MobileMealLog[] }>("/api/mobile/meals", accessToken);
}

export async function createMobileMeal(accessToken: string, input: MobileMealInput) {
  const response = await fetchJson<{ meal: MobileMealLog }>("/api/mobile/meals", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureEvent("meal_logged", { source: "manual", meal_type: input.mealType ?? "meal" });
  return response;
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
  const response = await fetchJson<{ meal: MobileMealLog }>("/api/mobile/meals/saved", accessToken, {
    method: "PUT",
    body: JSON.stringify({ id }),
  });
  captureEvent("meal_logged", { source: "saved" });
  return response;
}

export async function fetchMobileGoals(accessToken: string) {
  return fetchJson<{ activeGoals: MobileGoal[]; completedGoals: MobileGoal[] }>("/api/mobile/goals", accessToken);
}

export async function createMobileGoal(accessToken: string, input: MobileGoalInput) {
  const response = await fetchJson<{ goal: MobileGoal }>("/api/mobile/goals", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureEvent("goal_created", { task_type: input.taskType, priority: input.priority });
  return response;
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
  const response = await fetchJson<{ workout: MobileWorkoutLog }>("/api/mobile/workouts", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  captureEvent("workout_logged", { source: "manual", workout_type: input.workoutType });
  return response;
}

export async function trackMobilePlannedWorkout(accessToken: string, scheduleItemId: string) {
  const response = await fetchJson<{ workout: MobileWorkoutLog }>("/api/mobile/workouts", accessToken, {
    method: "PUT",
    body: JSON.stringify({ scheduleItemId }),
  });
  captureEvent("workout_logged", { source: "planned" });
  return response;
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

export async function parseMobileWorkoutPlan(accessToken: string, text: string, timezone: string) {
  return fetchJson<{ draft: MobileWorkoutScheduleDraft }>("/api/tracking/workouts/plan/parse", accessToken, {
    method: "POST",
    body: JSON.stringify({ text, timezone }),
  });
}

export async function applyMobileWorkoutPlan(accessToken: string, draft: MobileWorkoutScheduleDraft) {
  return fetchJson<{ applied: { scheduleItemsCreated: number } }>(
    "/api/tracking/workouts/plan/apply",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ draft }),
    },
  );
}

export async function parseMobileWorkout(accessToken: string, text: string, timezone: string) {
  return fetchJson<{ draft: MobileWorkoutDraft }>("/api/tracking/workouts/parse", accessToken, {
    method: "POST",
    body: JSON.stringify({ text, timezone }),
  });
}

export async function applyMobileWorkoutDraft(accessToken: string, draft: MobileWorkoutDraft) {
  const response = await fetchJson<{ applied: { workoutsCreated: number } }>("/api/tracking/workouts/apply", accessToken, {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  captureEvent("workout_logged", { source: "ai_text", workout_type: draft.workout_type });
  return response;
}

export async function suggestMobileWorkout(
  accessToken: string,
  options: { currentDraft?: MobileWorkoutSuggestionDraft | null; feedback?: string | null } = {},
) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return fetchJson<MobileWorkoutSuggestionResponse>("/api/tracking/workouts/suggest", accessToken, {
    method: "POST",
    body: JSON.stringify({
      currentDraft: options.currentDraft ?? null,
      feedback: options.feedback ?? null,
      currentIso: now.toISOString(),
      currentLocalDate: `${year}-${month}-${day}`,
      currentLocalTime: `${hours}:${minutes}`,
      todayEndIso: todayEnd.toISOString(),
      todayStartIso: todayStart.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
    }),
  });
}

export async function parseMobileMeal(
  accessToken: string,
  mode: "log" | "saved",
  text: string,
  timezone: string,
) {
  const path = mode === "log" ? "/api/tracking/meals/parse" : "/api/tracking/meals/saved/parse";
  return fetchJson<{ draft: MobileMealDraft }>(path, accessToken, {
    method: "POST",
    body: JSON.stringify({ text, timezone }),
  });
}

export async function applyMobileMealDraft(accessToken: string, draft: MobileMealDraft) {
  const path = draft.mode === "log" ? "/api/tracking/meals/apply" : "/api/tracking/meals/saved/apply";
  const response = await fetchJson<{ applied: { mealsLogged?: number; savedMealsCreated?: number } }>(path, accessToken, {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  captureEvent(draft.mode === "log" ? "meal_logged" : "saved_meal_created", {
    source: "ai_text",
    ...(draft.mode === "log" ? { meal_type: draft.meal_type } : {}),
  });
  return response;
}

export async function suggestMobileMeal(
  accessToken: string,
  options: { currentDraft?: MobileMealSuggestionDraft | null; feedback?: string | null } = {},
) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return fetchJson<MobileMealSuggestionResponse>("/api/tracking/meals/suggest", accessToken, {
    method: "POST",
    body: JSON.stringify({
      currentDraft: options.currentDraft ?? null,
      feedback: options.feedback ?? null,
      currentIso: now.toISOString(),
      currentLocalDate: `${year}-${month}-${day}`,
      currentLocalTime: `${hours}:${minutes}`,
      todayEndIso: todayEnd.toISOString(),
      todayStartIso: todayStart.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
    }),
  });
}
