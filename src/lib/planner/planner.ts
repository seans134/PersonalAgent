import type { CalendarEvent, DailyPlan, Goal, PlannerPreferences, PlannedItem, PlannedItemType } from "./types";
import { subtractRanges, toMinutes, toTimeString, type TimeRange } from "./time";

type TaskBlueprint = {
  type: Exclude<PlannedItemType, "fallback">;
  durationMinutes: number;
  title: string;
  reason: string;
};

function normalizePriority(priority: number): 1 | 2 | 3 {
  if (priority <= 1) return 1;
  if (priority === 2) return 2;
  return 3;
}

function normalizeDuration(value: number, minimum = 15, maximum = 180): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(value / 5) * 5));
}

function durationForPriority(priority: 1 | 2 | 3): number {
  if (priority === 1) return 45;
  if (priority === 2) return 35;
  return 25;
}

function createTaskBlueprints(goals: Goal[], preferences: PlannerPreferences): TaskBlueprint[] {
  const sortedGoals = [...goals].sort((a, b) => normalizePriority(a.priority) - normalizePriority(b.priority));

  const topGoal = sortedGoals.find((goal) => normalizePriority(goal.priority) === 1) ?? sortedGoals[0];
  const focusMinutes = normalizeDuration(preferences.focusBlockMinutes, 15, 240);

  const tasks: TaskBlueprint[] = [
    {
      type: "focus",
      durationMinutes: focusMinutes,
      title: "Focus block",
      reason: `Protect ${focusMinutes} minutes for high-quality deep work.`,
    },
  ];

  if (topGoal) {
    tasks.push({
      type: "goal",
      durationMinutes: durationForPriority(normalizePriority(topGoal.priority)),
      title: topGoal.title,
      reason: "Top-priority goal for today.",
    });
  }

  for (const goal of sortedGoals) {
    if (topGoal && goal.title === topGoal.title) {
      continue;
    }

    tasks.push({
      type: "goal",
      durationMinutes: durationForPriority(normalizePriority(goal.priority)),
      title: goal.title,
      reason: `Priority ${normalizePriority(goal.priority)} goal action.`,
    });
  }

  if (preferences.workoutPreference !== "none") {
    const wellbeingMinutes = preferences.workoutPreference === "intense" ? 45 : 30;
    tasks.push({
      type: "wellbeing",
      durationMinutes: wellbeingMinutes,
      title: "Wellbeing movement",
      reason: `${preferences.workoutPreference} workout preference is enabled.`,
    });
  }

  return tasks;
}

function addBusyRangesFromCalendar(events: CalendarEvent[]): TimeRange[] {
  return events.map((event) => ({
    start: toMinutes(event.startTime),
    end: toMinutes(event.endTime),
  }));
}

function addNoMeetingBusyRange(preferences: PlannerPreferences): TimeRange[] {
  if (!preferences.noMeetingStartTime || !preferences.noMeetingEndTime) {
    return [];
  }

  const start = toMinutes(preferences.noMeetingStartTime);
  const end = toMinutes(preferences.noMeetingEndTime);

  if (end <= start) {
    return [];
  }

  return [{ start, end }];
}

function scheduleTasks(freeRanges: TimeRange[], tasks: TaskBlueprint[]): PlannedItem[] {
  const scheduled: PlannedItem[] = [];

  for (const task of tasks) {
    const slot = freeRanges.find((range) => range.end - range.start >= task.durationMinutes);
    if (!slot) {
      continue;
    }

    const start = slot.start;
    const end = start + task.durationMinutes;

    scheduled.push({
      type: task.type,
      title: task.title,
      reason: task.reason,
      startTime: toTimeString(start),
      endTime: toTimeString(end),
    });

    slot.start = end;
  }

  return scheduled;
}

function hasType(items: PlannedItem[], type: PlannedItemType): boolean {
  return items.some((item) => item.type === type);
}

function needsFallback(items: PlannedItem[], preferences: PlannerPreferences): boolean {
  if (!hasType(items, "goal") || !hasType(items, "focus")) {
    return true;
  }

  if (preferences.workoutPreference !== "none" && !hasType(items, "wellbeing")) {
    return true;
  }

  return false;
}

export function generateDailyPlan(input: {
  goals: Goal[];
  preferences: PlannerPreferences;
  calendarEvents: CalendarEvent[];
}): DailyPlan {
  const { goals, preferences, calendarEvents } = input;

  const dayWindow: TimeRange = {
    start: toMinutes(preferences.workStartTime),
    end: toMinutes(preferences.workEndTime),
  };

  if (dayWindow.end <= dayWindow.start) {
    return {
      constrained: true,
      explanation: "Work window is invalid. Update your onboarding time range.",
      items: [
        {
          type: "fallback",
          title: "Fix schedule constraints",
          reason: "Set a valid work start/end window so Atlas can place actions.",
          startTime: preferences.workStartTime,
          endTime: preferences.workEndTime,
        },
      ],
    };
  }

  const busyRanges = [...addBusyRangesFromCalendar(calendarEvents), ...addNoMeetingBusyRange(preferences)];
  const freeRanges = subtractRanges(dayWindow, busyRanges);
  const tasks = createTaskBlueprints(goals, preferences);
  const items = scheduleTasks(freeRanges, tasks);

  if (needsFallback(items, preferences)) {
    return {
      constrained: true,
      explanation: "Time is constrained today, so Atlas returned a minimal plan.",
      items: [
        ...items,
        {
          type: "fallback",
          title: "Minimal execution plan",
          reason: "Protect at least one small action and reschedule remaining items tomorrow.",
          startTime: items[0]?.startTime ?? preferences.workStartTime,
          endTime: items[0]?.endTime ?? preferences.workStartTime,
        },
      ],
    };
  }

  return {
    constrained: false,
    items,
  };
}
