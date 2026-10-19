import type { TodayPlanResponse } from "@personal-agent/core/planner/client-types";
import type { HabitDigest, HabitMetrics, HabitPeriod, Nudge } from "@personal-agent/core/habits";
import type { CalendarEvent } from "@personal-agent/core/calendar";
import { analyticsEvents, hasCoursesReady, type NeededScore, type SyllabusImportSource } from "@personal-agent/core";
import { captureEvent, captureException } from "./analytics";
import { requireMobileEnv } from "./env";
import { currentExamReminderSession, syncExamReminders } from "./notifications";

export type { HabitDigest, HabitMetrics, HabitPeriod, Nudge };

export type MobileHabitReport = {
  period: HabitPeriod;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: HabitMetrics;
  nudges: Nudge[];
  digest: HabitDigest;
  source: string;
};

export type MobileOnboardingInput = {
  workStartTime: string;
  workEndTime: string;
  focusBlockMinutes: number;
  /** Omit to leave the saved preference unchanged (wellness tracking is off). */
  workoutPreference?: "none" | "light" | "moderate" | "intense";
  goalTitle: string;
  goalDescription?: string;
  goalPriority: 1 | 2 | 3;
  goalTaskType: "general" | "focus" | "fitness" | "wellness" | "admin";
  minimumDailyMinutes: number;
};

export type MobileOnboardingMode = "school_work" | "weekly_rhythm" | "goals";

export type MobileOnboardingGoalDraft = {
  title: string;
  description?: string | null;
  priority: 1 | 2 | 3;
  taskType: "general" | "focus" | "fitness" | "wellness" | "admin";
  minimumDailyMinutes: number;
  endDate?: string | null;
};

export type MobileOnboardingScheduleBlockDraft = {
  title: string;
  category: MobileCalendarCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  endDayOffset?: 0 | 1;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  timezone: string;
};

export type MobileOnboardingProfileDraft = {
  workStartTime?: string | null;
  workEndTime?: string | null;
  noMeetingStartTime?: string | null;
  noMeetingEndTime?: string | null;
  focusBlockMinutes?: number | null;
  workoutPreference?: "none" | "light" | "moderate" | "intense" | null;
};

export type MobileOnboardingDraft = {
  profile: MobileOnboardingProfileDraft;
  goals: MobileOnboardingGoalDraft[];
  scheduleBlocks: MobileOnboardingScheduleBlockDraft[];
  warnings: string[];
};

export type MobileOnboardingApplied = {
  profileUpdated: boolean;
  goalsCreated: number;
  scheduleBlocksCreated: number;
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
  endDayOffset?: 0 | 1;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  timezone?: string;
};

export type MobileCalendarEvent = {
  id: string;
  title: string;
  category: MobileCalendarCategory;
  date: string;
  startTime: string;
  endTime: string;
  endDayOffset?: 0 | 1;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  source: "manual";
};

export type MobileCalendarResponse = {
  timezone?: string;
  visibility: MobileCalendarVisibility;
  scheduleBlocks: MobileScheduleBlock[];
  events: MobileCalendarEvent[];
  /** Exams, tests, quizzes and assignment deadlines from the user's courses. */
  courseEvents?: CalendarEvent[];
};

export type MobileCalendarEventInput = {
  id?: string;
  kind: "event";
  title: string;
  category: MobileCalendarCategory;
  date: string;
  startTime: string;
  endTime: string;
  endDayOffset?: 0 | 1;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

export type MobileScheduleBlockInput = {
  id?: string;
  kind: "block";
  title: string;
  category: MobileCalendarCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  endDayOffset?: 0 | 1;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
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

export type MobileMealCoachIntent = "log" | "saved" | "suggest";

export type MobileCoachIntentSource = "model" | "heuristic" | "user";

export type MobileMealCoachResponse = {
  intent: MobileMealCoachIntent;
  intent_reason: string;
  intent_source: MobileCoachIntentSource;
  agent_reply: string | null;
  suggestion: MobileMealSuggestionDraft | null;
  draft: MobileMealDraft | null;
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

export type MobileWorkoutCoachIntent = "log" | "suggest";

export type MobileWorkoutCoachResponse = {
  intent: MobileWorkoutCoachIntent;
  intent_reason: string;
  intent_source: MobileCoachIntentSource;
  agent_reply: string | null;
  suggestion: MobileWorkoutSuggestionDraft | null;
  draft: MobileWorkoutDraft | null;
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
  // onboarding_completed now fires from completeMobileOnboarding when a student reaches Done.
  captureEvent("planner_profile_saved", { goals_created: body.goalsCreated ?? 0 });
  return body;
}

export type MobilePlannerProfile = {
  workStartTime: string;
  workEndTime: string;
  focusBlockMinutes: number;
  workoutPreference: NonNullable<MobileOnboardingInput["workoutPreference"]>;
};

export async function fetchMobilePlannerProfile(accessToken: string) {
  return fetchJson<{ profile: MobilePlannerProfile | null }>(
    "/api/mobile/onboarding",
    accessToken,
    { method: "GET" },
    "Unable to load planner preferences.",
  );
}

export type MobileOnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
};

export type MobileOnboardingCompleteResult = {
  completedAt: string;
  alreadyCompleted: boolean;
};

export async function fetchMobileOnboardingStatus(accessToken: string): Promise<MobileOnboardingStatus> {
  return fetchJson<MobileOnboardingStatus>(
    "/api/mobile/onboarding/complete",
    accessToken,
    { method: "GET" },
    "Unable to load onboarding status.",
  );
}

/** Marks onboarding complete on reaching Done (finished or skipped). Safe to call again. */
export async function completeMobileOnboarding(
  accessToken: string,
  progress: { courseCount: number; classTimeCount: number },
): Promise<MobileOnboardingCompleteResult> {
  const body = await fetchJson<MobileOnboardingCompleteResult>(
    "/api/mobile/onboarding/complete",
    accessToken,
    { method: "POST" },
    "Unable to finish onboarding.",
  );
  if (!body.alreadyCompleted) {
    captureEvent(analyticsEvents.onboardingCompleted, {
      courses: progress.courseCount,
      class_times: progress.classTimeCount,
      skipped_setup: !hasCoursesReady(progress),
    });
    if (hasCoursesReady(progress)) {
      captureEvent(analyticsEvents.coursesReady, {
        courses: progress.courseCount,
        class_times: progress.classTimeCount,
      });
    }
  }
  return body;
}

export async function parseMobileOnboarding(
  accessToken: string,
  mode: MobileOnboardingMode,
  text: string,
  timezone: string,
) {
  return fetchJson<{ draft: MobileOnboardingDraft }>(
    "/api/onboarding/parse",
    accessToken,
    { method: "POST", body: JSON.stringify({ mode, text, timezone }) },
    "Unable to parse onboarding note.",
  );
}

export async function applyMobileOnboarding(
  accessToken: string,
  mode: MobileOnboardingMode,
  draft: MobileOnboardingDraft,
  timezone: string,
) {
  const body = await fetchJson<{ applied: MobileOnboardingApplied }>(
    "/api/onboarding/apply",
    accessToken,
    { method: "POST", body: JSON.stringify({ draft, mode, timezone }) },
    "Unable to apply onboarding drafts.",
  );
  captureEvent("onboarding_draft_applied", {
    mode,
    goals_created: body.applied.goalsCreated,
    schedule_blocks_created: body.applied.scheduleBlocksCreated,
  });
  return body;
}

export async function generateMobileTodayPlan(accessToken: string): Promise<MobileTodayPlanResponse> {
  const body = await fetchJson<MobileTodayPlanResponse>(
    "/api/mobile/plan/today",
    accessToken,
    { method: "POST" },
    "Unable to generate today plan.",
  );
  captureEvent(analyticsEvents.planGenerated);
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
      // FormData bodies must let fetch set the multipart boundary itself.
      ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
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
    // A 413 can come from the platform before our handler runs, without a JSON body.
    const statusMessage =
      response.status === 413 ? SYLLABUS_TOO_LARGE_MESSAGE : `${fallbackError} (status ${response.status})`;
    const error = new Error(errorBody?.error ?? statusMessage);
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

export async function deleteMobileCalendarItem(
  accessToken: string,
  kind: "event" | "block" | "course_item",
  id: string,
) {
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

export async function fetchMobileInsights(
  accessToken: string,
  period: HabitPeriod,
  options: { referenceDate?: string; timezone?: string; refresh?: boolean } = {},
): Promise<{ report: MobileHabitReport }> {
  const params = new URLSearchParams({ period });
  if (options.referenceDate) params.set("referenceDate", options.referenceDate);
  if (options.timezone) params.set("timezone", options.timezone);
  if (options.refresh) params.set("refresh", "true");
  return fetchJson<{ report: MobileHabitReport }>(
    `/api/mobile/insights?${params.toString()}`,
    accessToken,
    { method: "GET" },
    "Unable to load insights.",
  );
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

export async function applyMobileWorkoutDraft(accessToken: string, draft: MobileWorkoutDraft) {
  const response = await fetchJson<{ applied: { workoutsCreated: number } }>("/api/tracking/workouts/apply", accessToken, {
    method: "POST",
    body: JSON.stringify({ draft }),
  });
  captureEvent("workout_logged", { source: "ai_text", workout_type: draft.workout_type });
  return response;
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

function coachTimeContext() {
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

  return {
    currentIso: now.toISOString(),
    currentLocalDate: `${year}-${month}-${day}`,
    currentLocalTime: `${hours}:${minutes}`,
    todayEndIso: todayEnd.toISOString(),
    todayStartIso: todayStart.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
  };
}

export async function sendMealCoachMessage(
  accessToken: string,
  text: string,
  options: {
    currentDraft?: MobileMealSuggestionDraft | null;
    forceIntent?: MobileMealCoachIntent | null;
  } = {},
) {
  const response = await fetchJson<MobileMealCoachResponse>(
    "/api/tracking/meals/assistant",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        ...coachTimeContext(),
        text,
        currentDraft: options.currentDraft ?? null,
        forceIntent: options.forceIntent ?? null,
      }),
    },
    "Unable to handle that message.",
  );
  captureEvent("meal_coach_message", {
    intent: response.intent,
    intent_source: response.intent_source,
  });
  return response;
}

export async function sendWorkoutCoachMessage(
  accessToken: string,
  text: string,
  options: {
    currentDraft?: MobileWorkoutSuggestionDraft | null;
    forceIntent?: MobileWorkoutCoachIntent | null;
  } = {},
) {
  const response = await fetchJson<MobileWorkoutCoachResponse>(
    "/api/tracking/workouts/assistant",
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        ...coachTimeContext(),
        text,
        currentDraft: options.currentDraft ?? null,
        forceIntent: options.forceIntent ?? null,
      }),
    },
    "Unable to handle that message.",
  );
  captureEvent("workout_coach_message", {
    intent: response.intent,
    intent_source: response.intent_source,
  });
  return response;
}

export type MobileCourseSummary = {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  term: string | null;
  targetGrade: number | null;
  archivedAt: string | null;
  average: number | null;
  gradedWeight: number;
  nextItem: { id: string; title: string; kind: "assignment" | "quiz" | "exam"; dueAt: string } | null;
  // Soonest ungraded exam due after now.
  nextExam: { id: string; title: string; dueAt: string } | null;
  dueThisWeek: number;
  // Average needed on the remaining work to hit targetGrade.
  needed: NeededScore;
};

export type MobileCourseDetail = {
  course: {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    term: string | null;
    target_grade: number | null;
    archived_at: string | null;
  };
  categories: Array<{ id: string; name: string; weight: number; position: number }>;
  items: Array<{
    id: string;
    course_id: string;
    category_id: string | null;
    kind: "assignment" | "quiz" | "exam";
    title: string;
    due_at: string;
    end_at: string | null;
    location: string | null;
    score_earned: number | null;
    score_max: number;
    estimated_effort_hours: number | null;
    focus_mode: "finish_first" | "continuous" | "deferred";
  }>;
  grade: {
    average: number | null;
    gradedWeight: number;
    warnings: string[];
    categories: Array<{ id: string; name: string; weight: number; score: number | null; gradedCount: number; itemCount: number }>;
  };
  needed: NeededScore;
};

export type MobileCourseInput = {
  name: string;
  code?: string | null;
  color?: string | null;
  term?: string | null;
  targetGrade?: number | null;
};

export type MobileCourseUpdateInput = {
  name?: string;
  code?: string | null;
  color?: string | null;
  term?: string | null;
  targetGrade?: number | null;
  archived?: boolean;
};

export type MobileCourseCategoryInput = {
  categoryId?: string;
  name?: string;
  weight?: number;
  position?: number;
};

export type MobileCourseItemInput = {
  itemId?: string;
  kind?: "assignment" | "quiz" | "exam";
  title?: string;
  categoryId?: string | null;
  dueAt?: string;
  endAt?: string | null;
  location?: string | null;
  scoreMax?: number;
  scoreEarned?: number | null;
  estimatedEffortHours?: number | null;
  focusMode?: "finish_first" | "continuous" | "deferred";
};

export async function fetchMobileCourses(
  accessToken: string,
  includeArchived?: boolean,
): Promise<{ courses: MobileCourseSummary[] }> {
  const path = includeArchived ? "/api/mobile/courses?archived=1" : "/api/mobile/courses";
  // Noted before the request so a load that finishes after sign-out can't reschedule reminders.
  const reminderSession = currentExamReminderSession();
  const response = await fetchJson<{ courses: MobileCourseSummary[] }>(
    path, accessToken, { method: "GET" }, "Unable to load courses.",
  );
  // Every course-summary load is the one place exam reminders are rescheduled (Today, Courses, after edits).
  void syncExamReminders(response.courses, reminderSession).catch(() => undefined);
  return response;
}

// Re-fetches course summaries after a change that can move or remove an exam, which reschedules
// exam reminders. Never throws; resolves to whether the refresh succeeded.
export async function refreshExamReminders(accessToken: string): Promise<boolean> {
  try {
    await fetchMobileCourses(accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function createMobileCourse(accessToken: string, input: MobileCourseInput) {
  const response = await fetchJson<{ course: MobileCourseDetail["course"] }>(
    "/api/mobile/courses",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
    "Unable to create course.",
  );
  captureEvent(analyticsEvents.courseCreated, { source: "manual" });
  return response;
}

export async function fetchMobileCourseDetail(accessToken: string, id: string): Promise<MobileCourseDetail> {
  return fetchJson<MobileCourseDetail>(
    `/api/mobile/courses/${id}`,
    accessToken,
    { method: "GET" },
    "Unable to load course.",
  );
}

export async function updateMobileCourse(accessToken: string, id: string, input: MobileCourseUpdateInput) {
  const response = await fetchJson<{ course: MobileCourseDetail["course"] }>(
    `/api/mobile/courses/${id}`,
    accessToken,
    { method: "PATCH", body: JSON.stringify(input) },
    "Unable to update course.",
  );
  // Renames and archiving change exam reminder copy or remove them.
  void refreshExamReminders(accessToken);
  return response;
}

export async function deleteMobileCourse(accessToken: string, id: string) {
  const response = await fetchJson<{ ok: true }>(
    `/api/mobile/courses/${id}`,
    accessToken,
    { method: "DELETE" },
    "Unable to remove course.",
  );
  void refreshExamReminders(accessToken);
  return response;
}

export async function saveMobileCategory(accessToken: string, courseId: string, input: MobileCourseCategoryInput) {
  return fetchJson<{ category: MobileCourseDetail["categories"][number] }>(
    `/api/mobile/courses/${courseId}/categories`,
    accessToken,
    { method: input.categoryId ? "PATCH" : "POST", body: JSON.stringify(input) },
    "Unable to save category.",
  );
}

export async function deleteMobileCategory(accessToken: string, courseId: string, categoryId: string) {
  return fetchJson<{ ok: true }>(
    `/api/mobile/courses/${courseId}/categories`,
    accessToken,
    { method: "DELETE", body: JSON.stringify({ categoryId }) },
    "Unable to remove category.",
  );
}

export async function saveMobileItem(accessToken: string, courseId: string, input: MobileCourseItemInput) {
  const response = await fetchJson<{ item: MobileCourseDetail["items"][number] }>(
    `/api/mobile/courses/${courseId}/items`,
    accessToken,
    { method: input.itemId ? "PATCH" : "POST", body: JSON.stringify(input) },
    "Unable to save item.",
  );
  void refreshExamReminders(accessToken);
  return response;
}

export async function setMobileItemGrade(
  accessToken: string,
  courseId: string,
  itemId: string,
  scoreEarned: number | null,
) {
  const response = await fetchJson<{ item: MobileCourseDetail["items"][number] }>(
    `/api/mobile/courses/${courseId}/items`,
    accessToken,
    { method: "PATCH", body: JSON.stringify({ itemId, scoreEarned }) },
    "Unable to save grade.",
  );
  captureEvent("course_item_graded");
  // A graded exam no longer needs reminders.
  void refreshExamReminders(accessToken);
  return response;
}

export async function deleteMobileItem(accessToken: string, courseId: string, itemId: string) {
  const response = await fetchJson<{ ok: true }>(
    `/api/mobile/courses/${courseId}/items`,
    accessToken,
    { method: "DELETE", body: JSON.stringify({ itemId }) },
    "Unable to remove item.",
  );
  void refreshExamReminders(accessToken);
  return response;
}

// Syllabus import: draft/result shapes mirror src/lib/courses/syllabus-parse.ts and the
// /api/courses/{parse,apply} envelopes (pinned in src/app/api/mobile-contract.test.ts).
export type MobileSyllabusItemKind = "assignment" | "quiz" | "exam";

export type MobileSyllabusDraft = {
  course: { name: string; code: string | null; term: string | null; target_grade: number | null };
  categories: Array<{ name: string; weight: number; position: number }>;
  items: Array<{
    kind: MobileSyllabusItemKind;
    title: string;
    // Links to a category by name; apply resolves it to an id after inserting categories.
    categoryName: string | null;
    end_at?: string | null;
    // Items without a due date can't be saved; they arrive with include: false.
    due_at: string | null;
    score_max: number;
    include: boolean;
  }>;
  warnings: string[];
};

// React Native upload part; size (bytes) is optional but lets us reject oversize files before uploading.
export type MobileSyllabusImportFile = { uri: string; name: string; type: string; size?: number | null };

export type MobileSyllabusParseResponse = { draft: MobileSyllabusDraft };

export type MobileSyllabusApplyInput = { draft: MobileSyllabusDraft };

export type MobileSyllabusApplyResult = { courseId: string; applied: { categories: number; items: number } };

// Mirrors the parse route's limit (Vercel caps request bodies around 4.5 MB).
export const SYLLABUS_MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
const SYLLABUS_TOO_LARGE_MESSAGE =
  "That file is too large to upload. Please use a syllabus under 4.5 MB, or paste the text instead.";

export async function parseSyllabusImport(
  accessToken: string,
  file: MobileSyllabusImportFile | null,
  text?: string,
): Promise<MobileSyllabusParseResponse> {
  if (file?.size && file.size > SYLLABUS_MAX_UPLOAD_BYTES) {
    throw new Error(SYLLABUS_TOO_LARGE_MESSAGE);
  }

  const body = new FormData();
  if (file) {
    // React Native's FormData takes a { uri, name, type } descriptor in place of a Blob.
    body.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  }
  if (text?.trim()) {
    body.append("text", text.trim());
  }

  return fetchJson<MobileSyllabusParseResponse>(
    "/api/mobile/courses/import/parse",
    accessToken,
    { method: "POST", body },
    "Unable to parse syllabus.",
  );
}

export async function applySyllabusImport(
  accessToken: string,
  draft: MobileSyllabusDraft,
  source: SyllabusImportSource,
) {
  const input: MobileSyllabusApplyInput = { draft };
  const response = await fetchJson<MobileSyllabusApplyResult>(
    "/api/mobile/courses/import/apply",
    accessToken,
    { method: "POST", body: JSON.stringify(input) },
    "Unable to create course.",
  );
  captureEvent(analyticsEvents.courseCreated, {
    source: "syllabus_import",
    categories: response.applied.categories,
    items: response.applied.items,
  });
  captureEvent(analyticsEvents.syllabusImported, {
    source,
    categories: response.applied.categories,
    items: response.applied.items,
  });
  void refreshExamReminders(accessToken);
  return response;
}
