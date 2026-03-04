export type Goal = {
  title: string;
  priority: 1 | 2 | 3;
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
  startTime: string;
  endTime: string;
};

export type PlannedItemType = "goal" | "focus" | "wellbeing" | "fallback";

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
