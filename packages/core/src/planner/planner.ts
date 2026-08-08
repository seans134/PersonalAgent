import type { CalendarEvent, DailyPlan, Goal, PlannerPreferences, PlannedItem, PlannedItemType, StudyTask } from "./types";
import { subtractRanges, toMinutes, toTimeString, type TimeRange } from "./time";

type TaskBlueprint = {
  type: Exclude<PlannedItemType, "fallback">;
  durationMinutes: number;
  title: string;
  reason: string;
  priority: 1 | 2 | 3;
  source: "system" | "goal" | "study";
};

type SlotCandidate = {
  start: number;
  end: number;
  rangeIndex: number;
  rangeStart: number;
  rangeEnd: number;
};

type ScoredSlotCandidate = SlotCandidate & {
  score: number;
};

type ScheduledPlanResult = {
  scheduled: Array<PlannedItem & { source: TaskBlueprint["source"] }>;
  remainingFreeRanges: TimeRange[];
};

type ContextKind = "academic" | "work" | "movement" | "personal" | "unavailable" | "unknown";

type ContextRange = TimeRange & {
  kind: ContextKind;
};

const CANDIDATE_STEP_MINUTES = 15;
const MIN_FALLBACK_MINUTES = 10;
const FALLBACK_ACTION_MINUTES = 25;
const ACADEMIC_KEYWORDS = [
  "assignment",
  "class",
  "course",
  "exam",
  "final",
  "homework",
  "lab",
  "lecture",
  "midterm",
  "quiz",
  "review",
  "school",
  "seminar",
  "study",
  "tutorial",
];
const ACADEMIC_SUBJECT_KEYWORDS = ["bio", "calculus", "chem", "econ", "math", "physics", "stats"];
const WORK_KEYWORDS = ["client", "meeting", "office", "shift", "standup", "sync", "work"];
const MOVEMENT_KEYWORDS = [
  "cardio",
  "exercise",
  "fitness",
  "gym",
  "jacked",
  "lift",
  "muscle",
  "run",
  "strength",
  "training",
  "walk",
  "workout",
  "yoga",
];
const PERSONAL_KEYWORDS = ["appointment", "dinner", "errand", "friends", "hangout", "lunch", "personal"];

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

function durationForGoal(goal: Goal): number {
  const defaultDuration = durationForPriority(normalizePriority(goal.priority));
  const requestedDuration = normalizeDuration(goal.minimumDailyMinutes ?? 0, 0, 180);
  return Math.max(defaultDuration, requestedDuration);
}

function goalTextForClassification(goal: Goal): string {
  return `${goal.title} ${goal.description ?? ""}`.toLowerCase();
}

function isMovementGoal(goal: Goal): boolean {
  if (goal.taskType === "fitness" || goal.taskType === "exercise") {
    return true;
  }

  if (goal.taskType && goal.taskType !== "general") {
    return false;
  }

  return hasKeyword(goalTextForClassification(goal), MOVEMENT_KEYWORDS);
}

function isWellnessGoal(goal: Goal): boolean {
  return goal.taskType === "wellness" || goal.taskType === "wellbeing";
}

function plannedTypeForGoal(goal: Goal): Exclude<PlannedItemType, "fallback"> {
  if (isMovementGoal(goal)) {
    return "fitness";
  }

  if (isWellnessGoal(goal)) {
    return "wellness";
  }

  if (goal.taskType === "focus") {
    return "focus";
  }

  return "goal";
}

function reasonForGoal(goal: Goal): string {
  const dailyMinutes = normalizeDuration(goal.minimumDailyMinutes ?? 0, 0, 180);
  const inferredTaskType = isMovementGoal(goal) ? "fitness" : isWellnessGoal(goal) ? "wellness" : goal.taskType;
  const typeLabel = inferredTaskType && inferredTaskType !== "general" ? `${inferredTaskType} goal` : "goal";

  if (dailyMinutes > 0) {
    return `Minimum ${dailyMinutes} minute daily ${typeLabel} action.`;
  }

  return `Priority ${normalizePriority(goal.priority)} ${typeLabel} action.`;
}

function createTaskBlueprints(goals: Goal[]): TaskBlueprint[] {
  const sortedGoals = [...goals].sort((a, b) => normalizePriority(a.priority) - normalizePriority(b.priority));

  const topGoal = sortedGoals.find((goal) => normalizePriority(goal.priority) === 1) ?? sortedGoals[0];
  const tasks: TaskBlueprint[] = [];

  if (topGoal) {
    tasks.push({
      type: plannedTypeForGoal(topGoal),
      durationMinutes: durationForGoal(topGoal),
      title: topGoal.title,
      reason: reasonForGoal(topGoal),
      priority: normalizePriority(topGoal.priority),
      source: "goal",
    });
  }

  for (const goal of sortedGoals) {
    if (topGoal && goal.title === topGoal.title) {
      continue;
    }

    tasks.push({
      type: plannedTypeForGoal(goal),
      durationMinutes: durationForGoal(goal),
      title: goal.title,
      reason: reasonForGoal(goal),
      priority: normalizePriority(goal.priority),
      source: "goal",
    });
  }

  return tasks;
}

function studyTasksToBlueprints(studyTasks: StudyTask[]): { finishFirst: TaskBlueprint[]; rest: TaskBlueprint[] } {
  const toBlueprint = (task: StudyTask): TaskBlueprint => ({
    type: "study",
    durationMinutes: normalizeDuration(task.durationMinutes, 15, 180),
    title: task.title,
    reason: task.reason,
    priority: task.priority,
    source: "study",
  });
  return {
    finishFirst: studyTasks.filter((t) => t.focusMode === "finish_first").map(toBlueprint),
    rest: studyTasks.filter((t) => t.focusMode !== "finish_first").map(toBlueprint),
  };
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

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyCalendarContext(event: CalendarEvent): ContextKind {
  if (event.category === "school" || event.category === "study") {
    return "academic";
  }

  if (event.category === "work") {
    return "work";
  }

  if (event.category === "personal") {
    return "personal";
  }

  if (event.category === "unavailable") {
    return "unavailable";
  }

  const title = (event.title ?? "").toLowerCase();

  if (hasKeyword(title, MOVEMENT_KEYWORDS)) {
    return "movement";
  }

  if (hasKeyword(title, WORK_KEYWORDS)) {
    return "work";
  }

  if (hasKeyword(title, ACADEMIC_KEYWORDS) || hasKeyword(title, ACADEMIC_SUBJECT_KEYWORDS)) {
    return "academic";
  }

  if (hasKeyword(title, PERSONAL_KEYWORDS)) {
    return "personal";
  }

  return "unknown";
}

function toContextRanges(events: CalendarEvent[]): ContextRange[] {
  return events
    .map((event) => ({
      start: toMinutes(event.startTime),
      end: toMinutes(event.endTime),
      kind: classifyCalendarContext(event),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
}

function generateCandidates(freeRanges: TimeRange[], task: TaskBlueprint): SlotCandidate[] {
  const candidates: SlotCandidate[] = [];

  freeRanges.forEach((range, rangeIndex) => {
    if (range.end - range.start < task.durationMinutes) {
      return;
    }

    const starts = new Set<number>([range.start, range.end - task.durationMinutes]);
    const firstAlignedStart = Math.ceil(range.start / CANDIDATE_STEP_MINUTES) * CANDIDATE_STEP_MINUTES;

    for (
      let start = firstAlignedStart;
      start + task.durationMinutes <= range.end;
      start += CANDIDATE_STEP_MINUTES
    ) {
      starts.add(start);
    }

    for (const start of starts) {
      const end = start + task.durationMinutes;
      if (start >= range.start && end <= range.end) {
        candidates.push({
          start,
          end,
          rangeIndex,
          rangeStart: range.start,
          rangeEnd: range.end,
        });
      }
    }
  });

  return candidates;
}

function scoreNaturalStart(start: number): number {
  const minute = start % 60;
  if (minute === 0 || minute === 30) return 14;
  if (minute === 15 || minute === 45) return 9;
  return -8;
}

function scoreTaskTimeFit(task: TaskBlueprint, candidate: SlotCandidate): number {
  const midpointHour = (candidate.start + task.durationMinutes / 2) / 60;

  if (task.type === "focus") {
    if (midpointHour >= 9 && midpointHour <= 12) return 26;
    if (midpointHour > 12 && midpointHour <= 15.5) return 10;
    return -12;
  }

  if (task.type === "fitness") {
    if (midpointHour >= 11.5 && midpointHour <= 14) return 22;
    if (midpointHour >= 16 && midpointHour <= 18) return 18;
    if (midpointHour < 10) return -6;
    return 8;
  }

  if (task.type === "wellness") {
    if (midpointHour >= 12 && midpointHour <= 15) return 16;
    if (midpointHour >= 18 && midpointHour <= 21) return 14;
    return 6;
  }

  if (task.type === "goal") {
    if (midpointHour >= 9 && midpointHour <= 12.5) return 18;
    if (midpointHour > 12.5 && midpointHour <= 16) return 10;
    return 0;
  }

  if (task.type === "study") {
    if (midpointHour >= 9 && midpointHour <= 12) return 24;
    if (midpointHour > 12 && midpointHour <= 16) return 10;
    return -8;
  }

  return 0;
}

function scoreReusableLeftover(gapMinutes: number): number {
  if (gapMinutes === 0) return 3;
  if (gapMinutes < 15) return -10;
  if (gapMinutes < 30) return 4;
  if (gapMinutes < 60) return 8;
  return 10;
}

function scoreFreeWindowFit(task: TaskBlueprint, candidate: SlotCandidate): number {
  const windowMinutes = candidate.rangeEnd - candidate.rangeStart;
  const extraMinutes = windowMinutes - task.durationMinutes;
  const gapBefore = candidate.start - candidate.rangeStart;
  const gapAfter = candidate.rangeEnd - candidate.end;
  const utilization = task.durationMinutes / windowMinutes;

  let score = scoreReusableLeftover(gapBefore) + scoreReusableLeftover(gapAfter);

  if (extraMinutes === 0) {
    score += task.type === "fitness" ? -4 : 14;
  } else if (extraMinutes < 15) {
    score -= 16;
  } else if (utilization >= 0.55 && utilization <= 0.95) {
    score += 18;
  } else if (utilization >= 0.3) {
    score += 10;
  } else {
    score += task.priority === 1 ? 3 : -4;
  }

  if (task.priority === 3) {
    if (extraMinutes <= 45) {
      score += 36;
    } else if (extraMinutes > 90) {
      score -= 24;
    }
  }

  return score;
}

function scoreBaseSlot(task: TaskBlueprint, candidate: SlotCandidate): number {
  return scoreNaturalStart(candidate.start) + scoreTaskTimeFit(task, candidate) + scoreFreeWindowFit(task, candidate);
}

function idealBufferForTask(task: TaskBlueprint): { before: number; after: number } {
  if (task.type === "fitness") {
    return { before: 45, after: 30 };
  }

  if (task.type === "wellness") {
    return { before: 20, after: 15 };
  }

  if (task.type === "focus") {
    return { before: 15, after: 15 };
  }

  return { before: 10, after: 10 };
}

function scoreBufferGap(bufferMinutes: number, idealMinutes: number, isDayBoundary: boolean): number {
  if (isDayBoundary && bufferMinutes === 0) return 8;
  if (bufferMinutes === 0) return -28;
  if (bufferMinutes < 10) return -18;
  if (bufferMinutes < idealMinutes) return -6;
  if (bufferMinutes <= idealMinutes + 30) return 22;
  if (bufferMinutes <= idealMinutes + 90) return 12;
  return 6;
}

function scoreTransitionBuffers(task: TaskBlueprint, candidate: SlotCandidate, dayWindow: TimeRange): number {
  const ideal = idealBufferForTask(task);
  const bufferBefore = candidate.start - candidate.rangeStart;
  const bufferAfter = candidate.rangeEnd - candidate.end;

  return (
    scoreBufferGap(bufferBefore, ideal.before, candidate.rangeStart === dayWindow.start) +
    scoreBufferGap(bufferAfter, ideal.after, candidate.rangeEnd === dayWindow.end)
  );
}

function overlapMinutes(first: TimeRange, second: TimeRange): number {
  return Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start));
}

function scoreNearbyBusyDensity(candidate: SlotCandidate, contextRanges: TimeRange[]): number {
  const nearbyWindow = {
    start: candidate.start - 90,
    end: candidate.end + 90,
  };
  const nearbyBusyMinutes = contextRanges.reduce(
    (total, range) => total + overlapMinutes(range, nearbyWindow),
    0,
  );

  if (nearbyBusyMinutes <= 60) return 6;
  if (nearbyBusyMinutes <= 120) return 2;
  return -12;
}

function nearestContextBefore(candidate: SlotCandidate, contextRanges: ContextRange[]): ContextRange | null {
  let nearest: ContextRange | null = null;

  for (const range of contextRanges) {
    if (range.end > candidate.start) {
      continue;
    }

    if (!nearest || range.end > nearest.end) {
      nearest = range;
    }
  }

  return nearest;
}

function nearestContextAfter(candidate: SlotCandidate, contextRanges: ContextRange[]): ContextRange | null {
  let nearest: ContextRange | null = null;

  for (const range of contextRanges) {
    if (range.start < candidate.end) {
      continue;
    }

    if (!nearest || range.start < nearest.start) {
      nearest = range;
    }
  }

  return nearest;
}

function isStructuredContext(kind: ContextKind | undefined): boolean {
  return kind === "academic" || kind === "work";
}

function scoreLocationContext(task: TaskBlueprint, candidate: SlotCandidate, contextRanges: ContextRange[]): number {
  const before = nearestContextBefore(candidate, contextRanges);
  const after = nearestContextAfter(candidate, contextRanges);
  const beforeGap = before ? candidate.start - before.end : Number.POSITIVE_INFINITY;
  const afterGap = after ? after.start - candidate.end : Number.POSITIVE_INFINITY;
  const beforeStructured = isStructuredContext(before?.kind);
  const afterStructured = isStructuredContext(after?.kind);
  const structuredSandwich = beforeStructured && afterStructured && beforeGap <= 120 && afterGap <= 120;

  if (task.type === "fitness") {
    let score = 0;

    if (structuredSandwich) {
      score -= 72;
    }

    if (beforeStructured && beforeGap < 45) {
      score -= 22;
    }

    if (afterStructured && afterGap < 60) {
      score -= 28;
    }

    if (before?.kind === "academic" && after?.kind === "academic" && after.start - before.end <= 240) {
      score -= 24;
    }

    if ((before?.kind === "movement" && beforeGap <= 90) || (after?.kind === "movement" && afterGap <= 90)) {
      score += 10;
    }

    return score;
  }

  if (task.type === "wellness") {
    if (structuredSandwich) {
      return -18;
    }

    return 0;
  }

  if (task.type === "focus") {
    let score = structuredSandwich ? 18 : 0;

    if (beforeStructured && beforeGap <= 60) {
      score += 8;
    }

    if (afterStructured && afterGap <= 60) {
      score += 6;
    }

    return score;
  }

  if (task.type === "goal" && structuredSandwich) {
    return 6;
  }

  return 0;
}

function nearestRangeBefore(candidate: SlotCandidate, ranges: TimeRange[]): TimeRange | null {
  let nearest: TimeRange | null = null;

  for (const range of ranges) {
    if (range.end > candidate.start) {
      continue;
    }

    if (!nearest || range.end > nearest.end) {
      nearest = range;
    }
  }

  return nearest;
}

function nearestRangeAfter(candidate: SlotCandidate, ranges: TimeRange[]): TimeRange | null {
  let nearest: TimeRange | null = null;

  for (const range of ranges) {
    if (range.start < candidate.end) {
      continue;
    }

    if (!nearest || range.start < nearest.start) {
      nearest = range;
    }
  }

  return nearest;
}

function scoreGeneratedGap(gapMinutes: number, idealMinutes: number): number {
  if (gapMinutes === 0) return -32;
  if (gapMinutes < 10) return -22;
  if (gapMinutes < idealMinutes) return -8;
  if (gapMinutes <= idealMinutes + 45) return 16;
  if (gapMinutes <= 120) return 8;
  return 3;
}

function scoreGeneratedTaskSpacing(task: TaskBlueprint, candidate: SlotCandidate, scheduledRanges: TimeRange[]): number {
  if (scheduledRanges.length === 0) {
    return 0;
  }

  const ideal = task.type === "fitness" ? 45 : task.type === "wellness" ? 20 : task.type === "focus" ? 15 : 10;
  const before = nearestRangeBefore(candidate, scheduledRanges);
  const after = nearestRangeAfter(candidate, scheduledRanges);

  return (
    (before ? scoreGeneratedGap(candidate.start - before.end, ideal) : 4) +
    (after ? scoreGeneratedGap(after.start - candidate.end, ideal) : 4)
  );
}

function scoreExistingScheduleContext(input: {
  candidate: SlotCandidate;
  contextRanges: TimeRange[];
  locationContextRanges: ContextRange[];
  dayWindow: TimeRange;
  task: TaskBlueprint;
}): number {
  const { candidate, contextRanges, locationContextRanges, dayWindow, task } = input;

  return (
    scoreTransitionBuffers(task, candidate, dayWindow) +
    scoreNearbyBusyDensity(candidate, contextRanges) +
    scoreLocationContext(task, candidate, locationContextRanges)
  );
}

function scorePriorityFit(task: TaskBlueprint, slotQualityScore: number): number {
  const normalizedQuality = Math.max(-40, Math.min(80, slotQualityScore));

  if (task.priority === 1) {
    return 18 + normalizedQuality * 0.28;
  }

  if (task.priority === 2) {
    return 8 + normalizedQuality * 0.12;
  }

  return -Math.max(0, normalizedQuality) * 0.16;
}

function rangesFromScheduledItems(items: PlannedItem[]): TimeRange[] {
  return items.map((item) => ({
    start: toMinutes(item.startTime),
    end: toMinutes(item.endTime),
  }));
}

function findBestSlot(input: {
  busyRanges: TimeRange[];
  dayWindow: TimeRange;
  freeRanges: TimeRange[];
  locationContextRanges: ContextRange[];
  scheduledItems: PlannedItem[];
  task: TaskBlueprint;
}): ScoredSlotCandidate | null {
  const candidates = generateCandidates(input.freeRanges, input.task);
  const scheduledRanges = rangesFromScheduledItems(input.scheduledItems);
  const contextRanges = [...input.busyRanges, ...scheduledRanges];

  const scored = candidates.map((candidate): ScoredSlotCandidate => {
    const baseSlotScore = scoreBaseSlot(input.task, candidate);
    const contextScore = scoreExistingScheduleContext({
      candidate,
      contextRanges,
      locationContextRanges: input.locationContextRanges,
      dayWindow: input.dayWindow,
      task: input.task,
    });
    const generatedSpacingScore = scoreGeneratedTaskSpacing(input.task, candidate, scheduledRanges);
    const slotQualityScore = baseSlotScore + contextScore + generatedSpacingScore;
    const priorityScore = scorePriorityFit(input.task, slotQualityScore);

    return {
      ...candidate,
      score: slotQualityScore + priorityScore,
    };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.start - b.start;
  })[0] ?? null;
}

function placeCandidate(freeRanges: TimeRange[], candidate: SlotCandidate): TimeRange[] {
  const nextRanges = freeRanges.flatMap((range, index): TimeRange[] => {
    if (index !== candidate.rangeIndex) {
      return [{ ...range }];
    }

    return [
      candidate.start > range.start ? { start: range.start, end: candidate.start } : null,
      candidate.end < range.end ? { start: candidate.end, end: range.end } : null,
    ].filter((range): range is TimeRange => range !== null && range.end > range.start);
  });

  return nextRanges.sort((a, b) => a.start - b.start);
}

function scheduleTasks(
  freeRanges: TimeRange[],
  tasks: TaskBlueprint[],
  busyRanges: TimeRange[],
  dayWindow: TimeRange,
  locationContextRanges: ContextRange[],
): ScheduledPlanResult {
  const scheduled: Array<PlannedItem & { source: TaskBlueprint["source"] }> = [];
  let remainingFreeRanges = freeRanges.map((range) => ({ ...range }));

  for (const task of tasks) {
    const slot = findBestSlot({
      busyRanges,
      dayWindow,
      freeRanges: remainingFreeRanges,
      locationContextRanges,
      scheduledItems: scheduled,
      task,
    });
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
      source: task.source,
    });

    remainingFreeRanges = placeCandidate(remainingFreeRanges, slot);
  }

  return {
    scheduled,
    remainingFreeRanges,
  };
}

function needsFallback(items: Array<PlannedItem & { source?: TaskBlueprint["source"] }>): boolean {
  const hasSubstantive = items.some(
    (item) => item.source === "goal" || item.source === "study" || item.type === "goal" || item.type === "study",
  );
  return !hasSubstantive;
}

function chooseFallbackSlot(freeRange: TimeRange, durationMinutes: number): TimeRange {
  const firstAlignedStart = Math.ceil(freeRange.start / CANDIDATE_STEP_MINUTES) * CANDIDATE_STEP_MINUTES;
  const starts = [freeRange.start, firstAlignedStart, freeRange.end - durationMinutes].filter(
    (start) => start >= freeRange.start && start + durationMinutes <= freeRange.end,
  );
  const bestStart = starts.sort((a, b) => scoreNaturalStart(b) - scoreNaturalStart(a) || a - b)[0] ?? freeRange.start;

  return {
    start: bestStart,
    end: bestStart + durationMinutes,
  };
}

function createConstrainedFallbackItem(
  remainingFreeRanges: TimeRange[],
  preferences: PlannerPreferences,
): PlannedItem {
  const fallbackRange = [...remainingFreeRanges]
    .filter((range) => range.end - range.start >= MIN_FALLBACK_MINUTES)
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)[0];

  if (!fallbackRange) {
    return {
      type: "fallback",
      title: "Minimal execution plan",
      reason: "Today is packed, so reschedule remaining items and protect the next available opening.",
      startTime: preferences.workStartTime,
      endTime: preferences.workStartTime,
    };
  }

  const durationMinutes = Math.min(FALLBACK_ACTION_MINUTES, fallbackRange.end - fallbackRange.start);
  const slot = chooseFallbackSlot(fallbackRange, durationMinutes);

  return {
    type: "fallback",
    title: "Minimal execution plan",
    reason: "Use the largest remaining opening for one small action and reschedule the rest.",
    startTime: toTimeString(slot.start),
    endTime: toTimeString(slot.end),
  };
}

export function generateDailyPlan(input: {
  goals: Goal[];
  preferences: PlannerPreferences;
  calendarEvents: CalendarEvent[];
  studyTasks?: StudyTask[];
}): DailyPlan {
  const { goals, preferences, calendarEvents, studyTasks = [] } = input;

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
  const locationContextRanges = toContextRanges(calendarEvents);
  const goalBlueprints = createTaskBlueprints(goals);
  const { finishFirst, rest } = studyTasksToBlueprints(studyTasks);
  const tasks = [...finishFirst, ...goalBlueprints, ...rest];
  const scheduleResult = scheduleTasks(freeRanges, tasks, busyRanges, dayWindow, locationContextRanges);
  const scheduledItems = scheduleResult.scheduled;
  const items = scheduledItems.map((item) => ({
    type: item.type,
    title: item.title,
    reason: item.reason,
    startTime: item.startTime,
    endTime: item.endTime,
  }));

  if (needsFallback(scheduledItems)) {
    return {
      constrained: true,
      explanation: "Time is constrained today, so Atlas returned a minimal plan.",
      items: [
        ...items,
        createConstrainedFallbackItem(scheduleResult.remainingFreeRanges, preferences),
      ],
    };
  }

  return {
    constrained: false,
    items,
  };
}
