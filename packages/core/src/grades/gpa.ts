import { normalizeTerm } from "./semester";

// GPA across courses and terms. A course counts when it has credits and a grade: its official
// final letter (courses.final_grade_override) when set, else its current computed percent
// (computeCourseGrade's average) mapped to a letter and marked in progress.

/** Letter grades, best first. The DB check on courses.final_grade_override lists the same values. */
export const LETTER_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"] as const;
export type LetterGrade = (typeof LETTER_GRADES)[number];

export type GpaScaleId = "us_4_0" | "us_4_3";
export type GpaScale = { id: GpaScaleId; label: string; max: number; points: Record<LetterGrade, number> };

const US_POINTS: Omit<Record<LetterGrade, number>, "A+"> = {
  A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0,
};

/**
 * Grade-point scales. To add one, add it here and widen the user_profiles.gpa_scale check in a
 * migration. Order is the order the Profile picker shows them.
 */
export const GPA_SCALES: Record<GpaScaleId, GpaScale> = {
  us_4_0: { id: "us_4_0", label: "4.0 scale (A+ = 4.0)", max: 4, points: { "A+": 4, ...US_POINTS } },
  us_4_3: { id: "us_4_3", label: "4.3 scale (A+ = 4.3)", max: 4.3, points: { "A+": 4.3, ...US_POINTS } },
};
export const GPA_SCALE_IDS = Object.keys(GPA_SCALES) as GpaScaleId[];
export const DEFAULT_GPA_SCALE: GpaScaleId = "us_4_0";

export function isGpaScaleId(value: unknown): value is GpaScaleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GPA_SCALES, value);
}

/** The scale for `id`, or the default scale when it isn't a known one. */
export function gpaScale(id: unknown): GpaScale {
  return GPA_SCALES[isGpaScaleId(id) ? id : DEFAULT_GPA_SCALE];
}

export function isLetterGrade(value: unknown): value is LetterGrade {
  return typeof value === "string" && (LETTER_GRADES as readonly string[]).includes(value);
}

/**
 * Lowest percent for each letter (standard US cutoffs). A+ starts at 97 so the 4.3 scale has
 * something to award; on the 4.0 scale A+ and A earn the same points.
 */
export const LETTER_CUTOFFS: ReadonlyArray<readonly [LetterGrade, number]> = [
  ["A+", 97], ["A", 93], ["A-", 90], ["B+", 87], ["B", 83], ["B-", 80],
  ["C+", 77], ["C", 73], ["C-", 70], ["D+", 67], ["D", 63], ["D-", 60],
];

// Tolerance so a computed 92.99999999 (float noise) still reads as an A.
const EPS = 1e-9;

export function percentToLetter(percent: number): LetterGrade {
  for (const [letter, cutoff] of LETTER_CUTOFFS) {
    if (percent >= cutoff - EPS) return letter;
  }
  return "F";
}

export function gradePoints(letter: LetterGrade, scale: GpaScale): number {
  return scale.points[letter];
}

/**
 * GPA for display, two decimals; "—" when there is none. `round` "up" is for a GPA the student
 * needs (a shown 3.71 must be enough), "down" for a best case (never overstate it); both ignore
 * float noise, so 3.7000000001 needed still reads 3.70.
 */
export function formatGpa(value: number | null, round: "nearest" | "up" | "down" = "nearest"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const hundredths =
    round === "up" ? Math.ceil(value * 100 - 1e-6) : round === "down" ? Math.floor(value * 100 + 1e-6) : Math.round(value * 100);
  return Math.max(0, hundredths / 100).toFixed(2);
}

/** Credit totals rounded to hundredths, so 0.1 + 0.2 credits reads 0.3. */
export function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

export const MAX_COURSE_CREDITS = 20;

/** Validates a credits value from a form or request: null/"" clears it; else a number from 0 to 20. */
export function parseCreditsInput(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_COURSE_CREDITS) {
    throw new Error(`Credits must be between 0 and ${MAX_COURSE_CREDITS}.`);
  }
  return n;
}

/** Validates a final letter grade from a form or request: null/"" clears it; case-insensitive. */
export function parseFinalGradeInput(value: unknown): LetterGrade | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Final grade must be a letter grade such as A- or B+.");
  const text = value.trim().toUpperCase();
  if (!text) return null;
  if (!isLetterGrade(text)) throw new Error("Final grade must be a letter grade such as A- or B+.");
  return text;
}

export type GpaCourseInput = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  credits: number | null;
  /** Official final letter (courses.final_grade_override). */
  finalGrade: LetterGrade | null;
  /** Current computed course percent (computeCourseGrade's average). */
  currentPercent: number | null;
  /** courses.target_grade, used for the projection. */
  targetPercent: number | null;
};

export type GpaCourseStatus = "final" | "in_progress";

export type GpaCourse = {
  id: string;
  label: string;
  credits: number;
  status: GpaCourseStatus;
  /** The computed percent behind an in-progress letter; null for final grades. */
  percent: number | null;
  letter: LetterGrade;
  points: number;
};

/** zero_credits: credits set to 0, as for a pass/fail course. */
export type GpaExclusionReason = "no_credits" | "zero_credits" | "no_grade";
export type GpaExcludedCourse = { id: string; label: string; term: string | null; reason: GpaExclusionReason };

export type GpaTerm = {
  /** Null groups courses with no term. */
  term: string | null;
  courses: GpaCourse[];
  credits: number;
  gpa: number | null;
  /** Every counted course in the term has its final grade. */
  isFinal: boolean;
  /** Term GPA if every unfinished course finishes at its target grade (current grade when no target). */
  projectedGpa: number | null;
};

export type GpaNeeded =
  | { status: "no_target" }
  /** No term has an unfinished course with credits, so there is nothing left to aim for. */
  | { status: "no_open_term" }
  | {
      status: "needed" | "secured" | "out_of_reach";
      target: number;
      term: string | null;
      /** Term GPA needed on the term's unfinished courses. */
      neededGpa: number;
      termCredits: number;
      /** Best cumulative GPA possible (every unfinished course at the top grade). */
      maxPossible: number;
    };

export type GpaSummary = {
  scale: GpaScaleId;
  scaleMax: number;
  cumulative: {
    gpa: number | null;
    credits: number;
    /** Official GPA: only courses with a final grade. */
    finalGpa: number | null;
    finalCredits: number;
    inProgressCredits: number;
  };
  /** Earliest first; recognised "Season Year" terms in calendar order, others after, no-term last. */
  terms: GpaTerm[];
  excluded: GpaExcludedCourse[];
  projection: {
    /** Cumulative GPA if every unfinished course finishes at its target grade. */
    gpa: number | null;
    credits: number;
    /** Unfinished courses whose target grade the projection used. */
    targetCourseCount: number;
  };
  needed: GpaNeeded;
  courseCount: number;
};

function courseLabel(course: { name: string; code: string | null }): string {
  return course.code?.trim() || course.name;
}

const SEASONS: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };

/** Sort key for a term: [year, season] for "Fall 2026" / "2026 Fall" / "Spring '27", else null. */
export function termSortKey(term: string): [number, number] | null {
  const text = term.toLowerCase();
  const yearMatch = text.match(/\b(\d{4})\b/) ?? text.match(/'(\d{2})\b/);
  if (!yearMatch) return null;
  const year = yearMatch[1].length === 2 ? 2000 + Number(yearMatch[1]) : Number(yearMatch[1]);
  const seasonMatch = text.match(/\b(winter|spring|summer|fall|autumn)\b/);
  return [year, seasonMatch ? SEASONS[seasonMatch[1]] : 4];
}

function compareTerms(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const ka = termSortKey(a);
  const kb = termSortKey(b);
  if (ka && kb) return ka[0] - kb[0] || ka[1] - kb[1] || a.localeCompare(b);
  if (ka) return -1;
  if (kb) return 1;
  return a.localeCompare(b);
}

type Counted = { credits: number; points: number };

function gpaOf(entries: Counted[]): number | null {
  const credits = entries.reduce((sum, e) => sum + e.credits, 0);
  if (!(credits > 0)) return null;
  return entries.reduce((sum, e) => sum + e.credits * e.points, 0) / credits;
}

function sumCredits(entries: { credits: number }[]): number {
  return roundCredits(entries.reduce((sum, e) => sum + e.credits, 0));
}

/**
 * Per-term and cumulative GPA on `scaleId`, credit-weighted. `targetGpa` (optional) is a cumulative
 * goal: `needed` says what GPA the open term needs to reach it. The open term is `requestedTerm`
 * when it has unfinished courses with credits, else the latest such dated term ("Fall 2026"); free-text
 * terms only when no dated term is open, and the no-term group last of all.
 */
export function buildGpaSummary(input: {
  courses: GpaCourseInput[];
  scaleId: unknown;
  targetGpa?: number | null;
  requestedTerm?: string | null;
}): GpaSummary {
  const scale = gpaScale(input.scaleId);
  const groups = new Map<string, { term: string | null; counted: GpaCourse[]; projected: Counted[]; open: number }>();
  const excluded: GpaExcludedCourse[] = [];
  const projectedAll: Counted[] = [];
  let targetCourseCount = 0;

  for (const course of input.courses) {
    const term = normalizeTerm(course.term);
    const key = term === null ? "" : term.toLowerCase();
    if (!groups.has(key)) groups.set(key, { term, counted: [], projected: [], open: 0 });
    const group = groups.get(key)!;
    const label = courseLabel(course);
    const credits = course.credits;
    if (credits === null || !Number.isFinite(credits) || credits < 0) {
      excluded.push({ id: course.id, label, term, reason: "no_credits" });
      continue;
    }
    if (credits === 0) {
      excluded.push({ id: course.id, label, term, reason: "zero_credits" });
      continue;
    }

    const current = course.currentPercent !== null && Number.isFinite(course.currentPercent) ? course.currentPercent : null;
    const target = course.targetPercent !== null && Number.isFinite(course.targetPercent) ? course.targetPercent : null;
    if (!course.finalGrade) group.open += credits;

    // Projection: final letter, else the target, else the current grade.
    const projectedLetter = course.finalGrade
      ?? (target !== null ? percentToLetter(target) : current !== null ? percentToLetter(current) : null);
    if (projectedLetter) {
      const entry = { credits, points: gradePoints(projectedLetter, scale) };
      group.projected.push(entry);
      projectedAll.push(entry);
      if (!course.finalGrade && target !== null) targetCourseCount += 1;
    }

    if (course.finalGrade) {
      group.counted.push({
        id: course.id, label, credits, status: "final", percent: null,
        letter: course.finalGrade, points: gradePoints(course.finalGrade, scale),
      });
    } else if (current !== null) {
      const letter = percentToLetter(current);
      group.counted.push({
        id: course.id, label, credits, status: "in_progress", percent: current, letter, points: gradePoints(letter, scale),
      });
    } else {
      excluded.push({ id: course.id, label, term, reason: "no_grade" });
    }
  }

  const ordered = [...groups.values()].sort((a, b) => compareTerms(a.term, b.term));
  const terms: GpaTerm[] = ordered
    .filter((group) => group.counted.length > 0 || group.open > 0)
    .map((group) => ({
      term: group.term,
      courses: group.counted,
      credits: sumCredits(group.counted),
      gpa: gpaOf(group.counted),
      isFinal: group.counted.length > 0 && group.counted.every((c) => c.status === "final"),
      projectedGpa: gpaOf(group.projected),
    }));

  const counted = terms.flatMap((t) => t.courses);
  const finals = counted.filter((c) => c.status === "final");
  const needed = gpaNeeded(input.targetGpa ?? null, scale, ordered, input.requestedTerm ?? null);

  return {
    scale: scale.id,
    scaleMax: scale.max,
    cumulative: {
      gpa: gpaOf(counted),
      credits: sumCredits(counted),
      finalGpa: gpaOf(finals),
      finalCredits: sumCredits(finals),
      inProgressCredits: roundCredits(sumCredits(counted) - sumCredits(finals)),
    },
    terms,
    excluded,
    projection: { gpa: gpaOf(projectedAll), credits: sumCredits(projectedAll), targetCourseCount },
    needed,
    courseCount: counted.length,
  };
}

/**
 * Term GPA needed on the open term's unfinished courses so the cumulative GPA lands on `target`.
 * Everything else counts as it stands: final grades, and other terms' in-progress grades.
 * Linear like computeNeededScore: cumulative(g) = (priorPoints + g * termCredits) / totalCredits.
 */
function gpaNeeded(
  target: number | null,
  scale: GpaScale,
  groups: Array<{ term: string | null; counted: GpaCourse[]; open: number }>,
  requestedTerm: string | null,
): GpaNeeded {
  if (target === null || !Number.isFinite(target)) return { status: "no_target" };
  const openGroups = groups.filter((g) => g.open > 0);
  if (openGroups.length === 0) return { status: "no_open_term" };
  const requested = normalizeTerm(requestedTerm)?.toLowerCase();
  const openTerm =
    openGroups.find((g) => g.term !== null && g.term.toLowerCase() === requested)
    // Groups are in term order (dated, then free-text, then no term): latest dated term first,
    // then the latest free-text term, then the no-term group.
    ?? [...openGroups].reverse().find((g) => g.term !== null && termSortKey(g.term) !== null)
    ?? [...openGroups].reverse().find((g) => g.term !== null)
    ?? openGroups[openGroups.length - 1];

  let priorCredits = 0;
  let priorPoints = 0;
  for (const group of groups) {
    for (const course of group.counted) {
      if (group === openTerm && course.status === "in_progress") continue;
      priorCredits += course.credits;
      priorPoints += course.credits * course.points;
    }
  }
  const termCredits = roundCredits(openTerm.open);
  const totalCredits = priorCredits + termCredits;
  let neededGpa = (target * totalCredits - priorPoints) / termCredits;
  if (Math.abs(neededGpa) <= EPS) neededGpa = 0;
  const maxPossible = (priorPoints + scale.max * termCredits) / totalCredits;
  const base = { target, term: openTerm.term, neededGpa, termCredits, maxPossible };
  if (neededGpa <= EPS) return { status: "secured", ...base };
  if (neededGpa > scale.max + EPS) return { status: "out_of_reach", ...base };
  return { status: "needed", ...base };
}

/** Shared copy for the cumulative-target line on web and mobile. Null when there's nothing to say. */
export function describeGpaNeeded(needed: GpaNeeded): string | null {
  switch (needed.status) {
    case "no_target":
      return null;
    case "no_open_term":
      return "Every course with credits has its final grade, so your cumulative GPA is set. Add next term's courses to plan ahead.";
    case "secured":
      return `You'll stay at or above ${formatGpa(needed.target)} whatever you get${needed.term ? ` in ${needed.term}` : " this term"}.`;
    case "out_of_reach":
      // Target up, best case down: the two never read the same.
      return `${formatGpa(needed.target, "up")} is out of reach this term: the best cumulative GPA you can reach is ${formatGpa(needed.maxPossible, "down")}.`;
    case "needed":
      return `You need a ${formatGpa(needed.neededGpa, "up")} term GPA${needed.term ? ` in ${needed.term}` : " this term"} (${needed.termCredits} credits) to reach ${formatGpa(needed.target)}.`;
  }
}

/** Parses a typed cumulative target: null unless a number above 0 and at most the scale's max. */
export function parseGpaTargetInput(text: string | null | undefined, scaleMax: number): number | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 && value <= scaleMax ? value : null;
}

export const GPA_EXCLUSION_COPY: Record<GpaExclusionReason, string> = {
  no_credits: "No credits set",
  zero_credits: "0 credits (pass/fail)",
  no_grade: "No grades yet",
};

export const GPA_STATUS_COPY: Record<GpaCourseStatus, string> = {
  final: "Final",
  in_progress: "In progress",
};
