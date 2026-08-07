export type CalendarEventCategory = "school" | "work" | "study" | "personal" | "unavailable";

export type Goal = {
  title: string;
  description?: string | null;
  priority: 1 | 2 | 3;
  taskType?: "general" | "focus" | "fitness" | "wellness" | "admin" | "exercise" | "wellbeing";
  minimumDailyMinutes?: number;
};

export type PlannerPreferences = {
  workStartTime: string;
  workEndTime: string;
  noMeetingStartTime?: string | null;
  noMeetingEndTime?: string | null;
  focusBlockMinutes: number;
  workoutPreference: "none" | "light" | "moderate" | "intense";
};

export type CalendarEvent = {
  id: string;
  title?: string;
  category?: CalendarEventCategory;
  startTime: string;
  endTime: string;
};

export type PlannedItemType = "goal" | "focus" | "fitness" | "wellness" | "study" | "fallback";

export type PlannedItem = {
  type: PlannedItemType;
  title: string;
  reason: string;
  startTime: string;
  endTime: string;
};

export type DailyPlan = {
  items: PlannedItem[];
  constrained: boolean;
  explanation?: string;
};

export type StudyFocusMode = "finish_first" | "continuous" | "deferred";
export type StudyTask = {
  id: string;
  title: string;
  reason: string;
  durationMinutes: number;
  priority: 1 | 2 | 3;
  focusMode: StudyFocusMode;
};
