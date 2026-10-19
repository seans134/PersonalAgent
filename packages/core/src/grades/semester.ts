import { shiftDate } from "../habits/metrics";
import { effortHoursFor, type StudyItem } from "./study";

export type SemesterCourse = { id: string; name: string; code: string | null; term: string | null };
export type SemesterCategory = { id: string; courseId: string; weight: number };
export type SemesterItemInput = {
  id: string;
  courseId: string;
  categoryId: string | null;
  kind: StudyItem["kind"];
  title: string;
  dueAt: string;
  /** Due date in the student's profile timezone (YYYY-MM-DD). */
  dueLocalDate: string;
  scoreEarned: number | null;
  /** Points possible; within a category the grade engine weights items by it. */
  scoreMax: number;
  estimatedEffortHours: number | null;
};

export type SemesterWeekItem = {
  id: string;
  courseId: string;
  /** "CHEM 201", or the course name when there's no code. */
  courseLabel: string;
  kind: StudyItem["kind"];
  title: string;
  dueAt: string;
  dueLocalDate: string;
  /**
   * Share of the course grade: the category weight split across its items by points possible, as
   * computeCourseGrade does. Null without a category or points.
   */
  weightPercent: number | null;
  effortHours: number;
  /** Scored items count as done. */
  isDone: boolean;
};

export type SemesterWeek = {
  /** Monday (YYYY-MM-DD). */
  weekStart: string;
  /** Sunday (YYYY-MM-DD). */
  weekEnd: string;
  isCurrent: boolean;
  items: SemesterWeekItem[];
  /** Estimated study hours for the week's items (the student's estimate, else the default for the kind). */
  loadHours: number;
  examCount: number;
  isCrunch: boolean;
};

export type SemesterTimeline = {
  todayLocalDate: string;
  /** The term shown; null when no course has a term. */
  term: string | null;
  /** Every term the student has, earliest items first; the picker shows when there are two or more. */
  terms: string[];
  /** From the current week through the week of the term's last dated item, empty weeks included. */
  weeks: SemesterWeek[];
  /** Earlier weeks that had items, oldest first. Clients collapse these by default. */
  pastWeeks: SemesterWeek[];
  /**
   * Items due after the last week shown (more than SEMESTER_MAX_WEEKS_AHEAD weeks past this week),
   * soonest first. Usually a mistyped year; clients list them under "Later" instead of as weeks.
   */
  laterItems: SemesterWeekItem[];
  /** Median load of the term's weeks that have items, the bar a crunch week is judged against. */
  medianLoadHours: number;
  crunchWeekCount: number;
};

/** A week is a crunch week when its load is at least this many times the term median... */
export const CRUNCH_LOAD_RATIO = 1.5;
/** ...and at least this many hours above it, so two light weeks don't trip it. */
export const CRUNCH_MIN_EXTRA_HOURS = 3;
/** Or when this many exams fall in it. */
export const CRUNCH_EXAM_COUNT = 2;

/** Weeks shown after the current week; anything later goes in laterItems instead of generating weeks. */
export const SEMESTER_MAX_WEEKS_AHEAD = 26;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(localDate: string): number {
  return Math.round(Date.parse(`${localDate}T00:00:00Z`) / DAY_MS);
}

/** A real YYYY-MM-DD calendar date (rejects "2026-02-30" and unparsable text). */
export function isValidLocalDate(localDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return false;
  const ms = Date.parse(`${localDate}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === localDate;
}

/** Monday of the week containing `localDate`. */
export function weekStartOf(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDate(localDate, -((weekday + 6) % 7));
}

/** Trimmed, single-spaced term, or null when blank. */
export function normalizeTerm(term: string | null | undefined): string | null {
  const text = (term ?? "").trim().replace(/\s+/g, " ");
  return text ? text : null;
}

function termKey(term: string): string {
  return term.toLowerCase();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The student's terms (spelled as first seen, matched case-insensitively), ordered by their
 * earliest dated item, with terms that have no items last by name.
 */
export function semesterTerms(courses: SemesterCourse[], items: SemesterItemInput[]): string[] {
  const byKey = new Map<string, { term: string; first: number }>();
  const termOfCourse = new Map<string, string>();
  for (const course of courses) {
    const term = normalizeTerm(course.term);
    if (!term) continue;
    const key = termKey(term);
    if (!byKey.has(key)) byKey.set(key, { term, first: Infinity });
    termOfCourse.set(course.id, key);
  }
  for (const item of items) {
    const key = termOfCourse.get(item.courseId);
    if (!key || !isValidLocalDate(item.dueLocalDate)) continue;
    const entry = byKey.get(key)!;
    entry.first = Math.min(entry.first, dayIndex(item.dueLocalDate));
  }
  return [...byKey.values()]
    .sort((a, b) => (a.first === b.first ? a.term.localeCompare(b.term) : a.first < b.first ? -1 : 1))
    .map((entry) => entry.term);
}

/**
 * The term the student is most likely in: one whose items span today (the latest-starting when
 * several do), else the next upcoming term, else the most recent past one. Terms without dated
 * items come last; null when no course has a term.
 */
export function defaultSemesterTerm(
  courses: SemesterCourse[],
  items: SemesterItemInput[],
  todayLocalDate: string,
): string | null {
  const terms = semesterTerms(courses, items);
  if (terms.length === 0) return null;
  const today = dayIndex(todayLocalDate);
  const keyOfCourse = new Map<string, string>();
  for (const course of courses) {
    const term = normalizeTerm(course.term);
    if (term) keyOfCourse.set(course.id, termKey(term));
  }
  // Dates past the timeline's cap are likely typos (they land in laterItems), so they don't stretch a term's span.
  const horizon = today + (SEMESTER_MAX_WEEKS_AHEAD + 1) * 7;
  const spans = new Map<string, { first: number; last: number }>();
  for (const item of items) {
    const key = keyOfCourse.get(item.courseId);
    if (!key || !isValidLocalDate(item.dueLocalDate)) continue;
    const day = dayIndex(item.dueLocalDate);
    if (day > horizon) continue;
    const span = spans.get(key);
    spans.set(key, span ? { first: Math.min(span.first, day), last: Math.max(span.last, day) } : { first: day, last: day });
  }
  const withSpans = terms.flatMap((term) => {
    const span = spans.get(termKey(term));
    return span ? [{ term, ...span }] : [];
  });
  const current = withSpans.filter((t) => t.first <= today && today <= t.last).sort((a, b) => b.first - a.first)[0];
  if (current) return current.term;
  const upcoming = withSpans.filter((t) => t.first > today).sort((a, b) => a.first - b.first)[0];
  if (upcoming) return upcoming.term;
  const past = withSpans.sort((a, b) => b.last - a.last)[0];
  return past ? past.term : terms[0];
}

/**
 * Each item's share of its course grade. computeCourseGrade scores a category as total points
 * earned over total points possible, so an item's share is the category weight times its points
 * over the category's points.
 */
export function itemWeightPercents(
  categories: SemesterCategory[],
  items: Array<Pick<SemesterItemInput, "id" | "categoryId" | "scoreMax">>,
): Map<string, number | null> {
  const weightById = new Map(categories.map((category) => [category.id, Number(category.weight)]));
  const pointsOf = (item: Pick<SemesterItemInput, "scoreMax">) => {
    const points = Number(item.scoreMax);
    return Number.isFinite(points) && points > 0 ? points : 0;
  };
  const pointsByCategory = new Map<string, number>();
  for (const item of items) {
    if (item.categoryId && weightById.has(item.categoryId)) {
      pointsByCategory.set(item.categoryId, (pointsByCategory.get(item.categoryId) ?? 0) + pointsOf(item));
    }
  }
  const result = new Map<string, number | null>();
  for (const item of items) {
    const weight = item.categoryId ? weightById.get(item.categoryId) : undefined;
    const total = item.categoryId ? pointsByCategory.get(item.categoryId) : undefined;
    const points = pointsOf(item);
    result.set(
      item.id,
      weight === undefined || !Number.isFinite(weight) || !total || !points ? null : round1((weight * points) / total),
    );
  }
  return result;
}

function isCrunchWeek(loadHours: number, examCount: number, medianLoadHours: number): boolean {
  if (examCount >= CRUNCH_EXAM_COUNT) return true;
  return (
    medianLoadHours > 0 &&
    loadHours >= medianLoadHours * CRUNCH_LOAD_RATIO &&
    loadHours - medianLoadHours >= CRUNCH_MIN_EXTRA_HOURS
  );
}

/**
 * Week-by-week view of a term's exams, quizzes and assignments (weeks start Monday, in the
 * student's local dates). The term is `requestedTerm` when it matches one of the student's
 * terms, else defaultSemesterTerm; courses with no term are grouped under that default. Weeks
 * stop SEMESTER_MAX_WEEKS_AHEAD weeks past the current one; items beyond go in laterItems and
 * don't count toward the median. A week's load is the estimated study hours of its items, scored
 * ones included, so a week's weight doesn't change as work is graded; it's a crunch week when the
 * load is well above the term's median or it holds two or more exams.
 */
export function buildSemesterTimeline(input: {
  courses: SemesterCourse[];
  categories: SemesterCategory[];
  items: SemesterItemInput[];
  todayLocalDate: string;
  requestedTerm?: string | null;
}): SemesterTimeline {
  const { courses, categories, items, todayLocalDate } = input;
  const terms = semesterTerms(courses, items);
  const defaultTerm = defaultSemesterTerm(courses, items, todayLocalDate);
  const requested = normalizeTerm(input.requestedTerm);
  const term = (requested && terms.find((t) => termKey(t) === termKey(requested))) || defaultTerm;

  const includedCourses = new Map<string, SemesterCourse>();
  for (const course of courses) {
    const courseTerm = normalizeTerm(course.term);
    const inTerm = term === null || (courseTerm ? termKey(courseTerm) === termKey(term) : term === defaultTerm);
    if (inTerm) includedCourses.set(course.id, course);
  }

  const weights = itemWeightPercents(categories, items);
  const termItems: SemesterWeekItem[] = items
    .filter((item) => includedCourses.has(item.courseId) && isValidLocalDate(item.dueLocalDate))
    .map((item) => {
      const course = includedCourses.get(item.courseId)!;
      return {
        id: item.id,
        courseId: item.courseId,
        courseLabel: course.code?.trim() || course.name,
        kind: item.kind,
        title: item.title,
        dueAt: item.dueAt,
        dueLocalDate: item.dueLocalDate,
        weightPercent: weights.get(item.id) ?? null,
        effortHours: effortHoursFor(item),
        isDone: item.scoreEarned !== null,
      };
    })
    .sort((a, b) => a.dueLocalDate.localeCompare(b.dueLocalDate) || Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.title.localeCompare(b.title));

  const currentWeek = weekStartOf(todayLocalDate);
  const lastShownWeek = shiftDate(currentWeek, SEMESTER_MAX_WEEKS_AHEAD * 7);
  const laterItems = termItems.filter((item) => item.dueLocalDate > shiftDate(lastShownWeek, 6));
  const itemsByWeek = new Map<string, SemesterWeekItem[]>();
  for (const item of termItems) {
    if (item.dueLocalDate > shiftDate(lastShownWeek, 6)) continue;
    const start = weekStartOf(item.dueLocalDate);
    const list = itemsByWeek.get(start) ?? [];
    list.push(item);
    itemsByWeek.set(start, list);
  }

  const loadOf = (weekItems: SemesterWeekItem[]) => round1(weekItems.reduce((sum, item) => sum + item.effortHours, 0));
  const medianLoadHours = round1(median([...itemsByWeek.values()].map(loadOf)));

  const makeWeek = (weekStart: string): SemesterWeek => {
    const weekItems = itemsByWeek.get(weekStart) ?? [];
    const loadHours = loadOf(weekItems);
    const examCount = weekItems.filter((item) => item.kind === "exam").length;
    return {
      weekStart,
      weekEnd: shiftDate(weekStart, 6),
      isCurrent: weekStart === currentWeek,
      items: weekItems,
      loadHours,
      examCount,
      isCrunch: isCrunchWeek(loadHours, examCount, medianLoadHours),
    };
  };

  const pastWeeks = [...itemsByWeek.keys()].filter((start) => start < currentWeek).sort().map(makeWeek);
  const weeks: SemesterWeek[] = [];
  const lastWeek = [...itemsByWeek.keys()].sort().pop();
  if (lastWeek && lastWeek >= currentWeek) {
    // Bounded: lastWeek is at most SEMESTER_MAX_WEEKS_AHEAD weeks past currentWeek.
    for (let start = currentWeek; start <= lastWeek; start = shiftDate(start, 7)) weeks.push(makeWeek(start));
  }

  return {
    todayLocalDate,
    term,
    terms,
    weeks,
    pastWeeks,
    laterItems,
    medianLoadHours,
    crunchWeekCount: weeks.filter((week) => week.isCrunch).length,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateParts(localDate: string): { month: number; day: number; weekday: number } {
  const date = new Date(`${localDate}T00:00:00Z`);
  return { month: date.getUTCMonth(), day: date.getUTCDate(), weekday: date.getUTCDay() };
}

/** "Oct 19 – 25", or "Oct 26 – Nov 1" across a month. */
export function formatSemesterWeekRange(week: Pick<SemesterWeek, "weekStart" | "weekEnd">): string {
  const start = dateParts(week.weekStart);
  const end = dateParts(week.weekEnd);
  const endLabel = start.month === end.month ? `${end.day}` : `${MONTHS[end.month]} ${end.day}`;
  return `${MONTHS[start.month]} ${start.day} – ${endLabel}`;
}

/** "Wed Oct 21". */
export function formatSemesterDueDay(localDate: string): string {
  const parts = dateParts(localDate);
  return `${WEEKDAYS[parts.weekday]} ${MONTHS[parts.month]} ${parts.day}`;
}

/** "About 10 h of study", or "Nothing due" for an empty week. */
export function formatSemesterLoad(week: Pick<SemesterWeek, "loadHours" | "items">): string {
  if (week.items.length === 0) return "Nothing due";
  const hours = Number.isInteger(week.loadHours) ? `${week.loadHours}` : week.loadHours.toFixed(1);
  return `About ${hours} h of study`;
}

/** Why a week is flagged: "Crunch week · 2 exams" or "Crunch week · heavy load"; null for other weeks. */
export function semesterCrunchLabel(week: Pick<SemesterWeek, "isCrunch" | "examCount">): string | null {
  if (!week.isCrunch) return null;
  return week.examCount >= CRUNCH_EXAM_COUNT ? `Crunch week · ${week.examCount} exams` : "Crunch week · heavy load";
}

/** "Exam · 25%"; the weight is left off when unknown. */
export function semesterItemMeta(item: Pick<SemesterWeekItem, "kind" | "weightPercent">): string {
  const kind = item.kind === "exam" ? "Exam" : item.kind === "quiz" ? "Quiz" : "Assignment";
  return item.weightPercent === null ? kind : `${kind} · ${item.weightPercent}%`;
}
