import type { StudyFocusMode, StudyTask } from "../planner/types";

export type StudyItem = {
  id: string;
  title: string;
  courseName: string;
  kind: "assignment" | "quiz" | "exam";
  dueLocalDate: string;
  scoreEarned: number | null;
  estimatedEffortHours: number | null;
  focusMode: StudyFocusMode;
};

/** Study hours assumed for an item the student has not estimated, by kind. */
export const DEFAULT_EFFORT_HOURS: Record<StudyItem["kind"], number> = {
  exam: 6,
  quiz: 2,
  assignment: 3,
};

/** The student's own positive estimate when set, else the default for the item's kind. */
export function effortHoursFor(item: Pick<StudyItem, "kind" | "estimatedEffortHours">): number {
  const own = item.estimatedEffortHours;
  return own !== null && own > 0 ? own : DEFAULT_EFFORT_HOURS[item.kind];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function diffInDays(fromLocalDate: string, toLocalDate: string): number {
  const from = Date.parse(`${fromLocalDate}T00:00:00Z`);
  const to = Date.parse(`${toLocalDate}T00:00:00Z`);
  return Math.round((from - to) / DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function kindNoun(kind: StudyItem["kind"]): string {
  return kind === "exam" ? "Exam" : kind === "quiz" ? "Quiz" : "Due";
}

/** How many days before the due date study starts, by kind. The last ramp day is the day before it's due. */
export const STUDY_RAMP_LEAD_DAYS: Record<StudyItem["kind"], number> = {
  exam: 7,
  quiz: 3,
  assignment: 7,
};

export const STUDY_BLOCK_MIN_MINUTES = 15;
export const STUDY_BLOCK_MAX_MINUTES = 120;

export type StudyRampDay = {
  localDate: string;
  /** 1-based position in the ramp; the day before the due date is day leadDays. */
  dayNumber: number;
  minutes: number;
  isToday: boolean;
};

export type StudyRamp = {
  itemId: string;
  kind: StudyItem["kind"];
  /** Length of the full ramp in days ("day 5 of 7"). */
  leadDays: number;
  effortMinutes: number;
  /** Study already checked off on earlier days. */
  doneMinutes: number;
  remainingMinutes: number;
  /** Today onward, only days with study; empty once the item is due, past, or fully studied. */
  days: StudyRampDay[];
};

/**
 * Relative weight of a ramp day. Exams and quizzes ramp linearly from 1x on the first day
 * to 3x on the day before; assignments stay even.
 */
function rampWeight(kind: StudyItem["kind"], dayNumber: number, leadDays: number): number {
  if (kind === "assignment" || leadDays <= 1) return 1;
  return 1 + (2 * (dayNumber - 1)) / (leadDays - 1);
}

/** Splits total by weight, capping each share at the max block and handing the excess to the uncapped days. */
function allocateByWeight(total: number, weights: number[]): number[] {
  const shares = weights.map(() => 0);
  let open = weights.map((_, index) => index);
  let left = total;
  while (open.length > 0 && left > 0) {
    const weightSum = open.reduce((sum, index) => sum + weights[index], 0);
    const capped = open.filter((index) => (left * weights[index]) / weightSum > STUDY_BLOCK_MAX_MINUTES);
    if (capped.length === 0) {
      for (const index of open) shares[index] = (left * weights[index]) / weightSum;
      break;
    }
    for (const index of capped) {
      shares[index] = STUDY_BLOCK_MAX_MINUTES;
      left -= STUDY_BLOCK_MAX_MINUTES;
    }
    open = open.filter((index) => !capped.includes(index));
  }
  return shares;
}

function roundBlock(minutes: number): number {
  return clamp(Math.round(minutes / 5) * 5, STUDY_BLOCK_MIN_MINUTES, STUDY_BLOCK_MAX_MINUTES);
}

function shiftLocalDate(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The study ramp for one item: its remaining effort (estimate minus study already done)
 * spread over the days from today to the day before it's due, heavier toward the due date.
 * Each day is 15-120 minutes in 5-minute steps; when the remaining effort is too small to
 * give every day 15 minutes, the earliest days drop out so the total stays close to it.
 */
export function studyRamp(
  item: Pick<StudyItem, "id" | "kind" | "dueLocalDate" | "estimatedEffortHours">,
  todayLocalDate: string,
  doneMinutes = 0,
): StudyRamp {
  const leadDays = STUDY_RAMP_LEAD_DAYS[item.kind];
  const effortMinutes = Math.round(effortHoursFor(item) * 60);
  const done = Math.max(0, Math.round(doneMinutes));
  const remainingMinutes = Math.max(0, effortMinutes - done);
  const ramp = { itemId: item.id, kind: item.kind, leadDays, effortMinutes, doneMinutes: done, remainingMinutes };
  const daysUntilDue = diffInDays(item.dueLocalDate, todayLocalDate);

  if (daysUntilDue < 0 || remainingMinutes <= 0) return { ...ramp, days: [] };
  if (daysUntilDue === 0) {
    // Due today: whatever is left goes into one last block.
    return {
      ...ramp,
      days: [{ localDate: todayLocalDate, dayNumber: leadDays, minutes: roundBlock(remainingMinutes), isToday: true }],
    };
  }

  let dayNumbers: number[] = [];
  for (let day = Math.max(1, leadDays - daysUntilDue + 1); day <= leadDays; day += 1) dayNumbers.push(day);
  let shares = allocateByWeight(remainingMinutes, dayNumbers.map((day) => rampWeight(item.kind, day, leadDays)));
  while (dayNumbers.length > 1 && shares[0] < STUDY_BLOCK_MIN_MINUTES) {
    dayNumbers = dayNumbers.slice(1);
    shares = allocateByWeight(remainingMinutes, dayNumbers.map((day) => rampWeight(item.kind, day, leadDays)));
  }

  const days = dayNumbers.map((dayNumber, index) => {
    const localDate = shiftLocalDate(item.dueLocalDate, dayNumber - leadDays - 1);
    return { localDate, dayNumber, minutes: roundBlock(shares[index]), isToday: localDate === todayLocalDate };
  });
  return { ...ramp, days };
}

/** Today's block from the item's ramp, in minutes (0 when today is not a study day for it). */
export function todayRampMinutes(ramp: StudyRamp): number {
  return ramp.days.find((day) => day.isToday)?.minutes ?? 0;
}

function priorityFor(item: StudyItem, todayLocalDate: string): 1 | 2 | 3 {
  if (item.focusMode === "finish_first") return 1;
  const daysUntilDue = Math.max(1, diffInDays(item.dueLocalDate, todayLocalDate));
  return daysUntilDue <= 1 ? 1 : daysUntilDue <= 3 ? 2 : 3;
}

function studyReason(item: StudyItem, ramp: StudyRamp, todayLocalDate: string): string {
  const daysUntilDue = diffInDays(item.dueLocalDate, todayLocalDate);
  const daysWord = daysUntilDue <= 0 ? "today" : daysUntilDue === 1 ? "tomorrow" : `in ${daysUntilDue} days`;
  const today = ramp.days.find((day) => day.isToday);
  const detail =
    item.kind !== "assignment" && today && daysUntilDue > 0
      ? `day ${today.dayNumber} of ${ramp.leadDays} of your study ramp.`
      : "reserving study time.";
  return `${item.courseName} · ${kindNoun(item.kind)} ${daysWord} · ${detail}`;
}

/**
 * Today's study blocks. Each item's block is today's day of its study ramp; finish_first items
 * are front-loaded (at least 45 minutes, about twice their share) and run even before their ramp
 * starts. doneMinutesByItemId is study already checked off on earlier days, keyed by item id.
 */
export function deriveStudyTasks(
  items: StudyItem[],
  todayLocalDate: string,
  horizonDays = 7,
  doneMinutesByItemId: Record<string, number> = {},
): StudyTask[] {
  const active = items.filter((item) => item.scoreEarned === null && diffInDays(item.dueLocalDate, todayLocalDate) >= 0);
  const hasActiveFinishFirst = active.some((item) => item.focusMode === "finish_first");

  const planned = active.flatMap((item) => {
    // An explicit estimate of 0 (or less) means "no study needed"; null falls back to the kind default.
    if (item.estimatedEffortHours !== null && !(item.estimatedEffortHours > 0)) return [];
    if (item.focusMode === "deferred" && hasActiveFinishFirst) return [];
    const daysUntilDue = Math.max(1, diffInDays(item.dueLocalDate, todayLocalDate));
    if (daysUntilDue > horizonDays) return [];

    const ramp = studyRamp(item, todayLocalDate, doneMinutesByItemId[item.id] ?? 0);
    if (ramp.remainingMinutes <= 0) return [];
    const rampMinutes = todayRampMinutes(ramp);
    if (item.focusMode === "finish_first") {
      const share = rampMinutes > 0 ? rampMinutes : Math.round(ramp.remainingMinutes / daysUntilDue);
      const upToRemaining = Math.ceil(ramp.remainingMinutes / 5) * 5;
      const frontLoaded = Math.round(Math.max(45, share * 2) / 5) * 5;
      const durationMinutes = clamp(Math.min(frontLoaded, upToRemaining), STUDY_BLOCK_MIN_MINUTES, STUDY_BLOCK_MAX_MINUTES);
      return [{ item, ramp, durationMinutes }];
    }
    return rampMinutes > 0 ? [{ item, ramp, durationMinutes: rampMinutes }] : [];
  });

  planned.sort((a, b) => {
    const aFF = a.item.focusMode === "finish_first" ? 0 : 1;
    const bFF = b.item.focusMode === "finish_first" ? 0 : 1;
    if (aFF !== bFF) return aFF - bFF;
    const aPriority = priorityFor(a.item, todayLocalDate);
    const bPriority = priorityFor(b.item, todayLocalDate);
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (a.item.dueLocalDate !== b.item.dueLocalDate) return a.item.dueLocalDate < b.item.dueLocalDate ? -1 : 1;
    return 0;
  });

  return planned.map(({ item, ramp, durationMinutes }) => ({
    id: item.id,
    title: `Study: ${item.title}`,
    reason: studyReason(item, ramp, todayLocalDate),
    durationMinutes,
    priority: priorityFor(item, todayLocalDate),
    focusMode: item.focusMode,
  }));
}

/**
 * Study ramps to show on unscored, upcoming exams and quizzes (course item detail on web and mobile),
 * keyed by item id. Items with an explicit estimate of 0, or nothing left to study, are left out.
 */
export function upcomingStudyRamps(
  items: StudyItem[],
  todayLocalDate: string,
  doneMinutesByItemId: Record<string, number> = {},
): Record<string, StudyRamp> {
  const ramps: Record<string, StudyRamp> = {};
  for (const item of items) {
    if (item.kind === "assignment" || item.scoreEarned !== null) continue;
    if (item.estimatedEffortHours !== null && !(item.estimatedEffortHours > 0)) continue;
    const ramp = studyRamp(item, todayLocalDate, doneMinutesByItemId[item.id] ?? 0);
    if (ramp.days.length > 0) ramps[item.id] = ramp;
  }
  return ramps;
}

/** Course detail payload (web page and GET /api/mobile/courses/[id] studyPlans): ramps by item id. */
export type CourseStudyPlans = {
  /** The student's local today, for labelling ramp days. */
  todayLocalDate: string;
  byItemId: Record<string, StudyRamp>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Tomorrow", or "Wed Oct 21" for a ramp day. */
export function studyRampDayLabel(localDate: string, todayLocalDate: string): string {
  const offset = diffInDays(localDate, todayLocalDate);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const date = new Date(`${localDate}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "45 min", "2 h", or "1 h 30 min". */
export function formatStudyMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
