import { isGeminiConfigured, requestSyllabusParse } from "@/lib/gemini/client";
import type { GeminiPart } from "@/lib/gemini/client";

export type SyllabusItemKind = "assignment" | "quiz" | "exam";

export type SyllabusCourseDraft = {
  name: string;
  code: string | null;
  term: string | null;
  target_grade: number | null;
};

export type SyllabusCategoryDraft = {
  name: string;
  weight: number;
  position: number;
};

export type SyllabusItemDraft = {
  kind: SyllabusItemKind;
  title: string;
  categoryName: string | null;
  due_at: string | null;
  score_max: number;
  include: boolean;
};

export type SyllabusDraft = {
  course: SyllabusCourseDraft;
  categories: SyllabusCategoryDraft[];
  items: SyllabusItemDraft[];
  warnings: string[];
};

export type ParseSyllabusInput = {
  parts: GeminiPart[];
  timezone?: string;
  today?: string;
  generateOutput?: (input: { parts: GeminiPart[]; timezone: string; today: string }) => Promise<unknown>;
};

const DEFAULT_SCORE_MAX = 100;

// Maps common syllabus wording onto the three kinds the course_items table accepts.
const KIND_SYNONYMS: Record<string, SyllabusItemKind> = {
  assignment: "assignment",
  homework: "assignment",
  hw: "assignment",
  "problem set": "assignment",
  pset: "assignment",
  project: "assignment",
  lab: "assignment",
  essay: "assignment",
  paper: "assignment",
  report: "assignment",
  quiz: "quiz",
  "pop quiz": "quiz",
  exam: "exam",
  midterm: "exam",
  final: "exam",
  test: "exam",
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampGrade(value: unknown, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    warnings.push("Target grade was ignored because it was not a number.");
    return null;
  }

  return Math.max(0, Math.min(100, num));
}

function clampWeight(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }

  return Math.max(0, Math.min(100, num));
}

function normalizeScoreMax(value: unknown, warnings: string[]): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_SCORE_MAX;
  }

  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    warnings.push("A max score was ignored because it was not a positive number; defaulted to 100.");
    return DEFAULT_SCORE_MAX;
  }

  return num;
}

function normalizeKind(value: unknown): SyllabusItemKind {
  const text = optionalString(value)?.toLowerCase();
  if (!text) {
    return "assignment";
  }

  if (text in KIND_SYNONYMS) {
    return KIND_SYNONYMS[text];
  }

  // Fall back to substring matching so "final exam" or "unit test" still resolve.
  for (const [needle, kind] of Object.entries(KIND_SYNONYMS)) {
    if (text.includes(needle)) {
      return kind;
    }
  }

  return "assignment";
}

function normalizeDueAt(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function validateSyllabusDraft(value: unknown): SyllabusDraft {
  const parsed = asObject(value);
  if (!parsed) {
    throw new Error("Syllabus parser payload is not an object.");
  }

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string").map((warning) => warning.trim())
    : [];

  const courseRaw = asObject(parsed.course) ?? {};
  const code = optionalString(courseRaw.code);
  let name = optionalString(courseRaw.name);
  if (!name) {
    name = code ?? "Untitled course";
    warnings.push("Course name was missing in the syllabus; please confirm it before saving.");
  }

  const course: SyllabusCourseDraft = {
    name: name.slice(0, 200),
    code: code ? code.slice(0, 60) : null,
    term: optionalString(courseRaw.term)?.slice(0, 60) ?? null,
    target_grade: clampGrade(courseRaw.target_grade, warnings),
  };

  const categoriesRaw = Array.isArray(parsed.categories) ? parsed.categories : [];
  const categories: SyllabusCategoryDraft[] = [];
  categoriesRaw.forEach((entry, index) => {
    const record = asObject(entry);
    if (!record) {
      return;
    }
    const categoryName = optionalString(record.name);
    if (!categoryName) {
      return;
    }
    categories.push({
      name: categoryName.slice(0, 120),
      weight: clampWeight(record.weight),
      position: index,
    });
  });

  if (categories.length > 0) {
    const weightSum = categories.reduce((sum, category) => sum + category.weight, 0);
    if (Math.abs(weightSum - 100) > 0.5) {
      warnings.push(`Category weights add up to ${Math.round(weightSum)}%, not 100%. Adjust them before saving.`);
    }
  }

  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
  const items: SyllabusItemDraft[] = [];
  let datelessCount = 0;
  itemsRaw.forEach((entry) => {
    const record = asObject(entry);
    if (!record) {
      return;
    }
    const title = optionalString(record.title);
    if (!title) {
      return;
    }
    const dueAt = normalizeDueAt(record.due_at);
    if (!dueAt) {
      datelessCount += 1;
    }
    items.push({
      kind: normalizeKind(record.kind),
      title: title.slice(0, 200),
      categoryName: optionalString(record.categoryName),
      due_at: dueAt,
      score_max: normalizeScoreMax(record.score_max, warnings),
      // Items without a valid due date can't be saved (course_items.due_at is NOT NULL),
      // so they start excluded until the user adds a date in the review step.
      include: Boolean(dueAt),
    });
  });

  if (datelessCount > 0) {
    warnings.push(
      `${datelessCount} item${datelessCount === 1 ? "" : "s"} had no clear due date and won't be added until you set one.`,
    );
  }

  return {
    course,
    categories,
    items,
    warnings: warnings.filter(Boolean),
  };
}

export async function parseSyllabus(input: ParseSyllabusInput): Promise<SyllabusDraft> {
  if (input.parts.length === 0) {
    throw new Error("Add a syllabus file or paste some text before parsing.");
  }

  const timezone = input.timezone ?? "America/Toronto";
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  const generate =
    input.generateOutput ??
    (async () => {
      if (!isGeminiConfigured()) {
        throw new Error("Syllabus parser skipped: GEMINI_API_KEY not configured.");
      }

      return requestSyllabusParse({ parts: input.parts, timezone, today });
    });

  const raw = await generate({ parts: input.parts, timezone, today });
  return validateSyllabusDraft(raw);
}
