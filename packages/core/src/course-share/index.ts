// Shareable course links (web /join/<token> and mobile atlas://join/<token>).
//
// A share hands classmates a template of a course: its name/code/term, weighted categories, and
// the dated items. The template is read from the database at join time and mapped through
// courseTemplateFromSnapshot, which copies only whitelisted fields, so scores, notes, target
// grades and anything about the owner never reach a classmate even if the snapshot grows.

export type CourseTemplateItemKind = "assignment" | "quiz" | "exam";

export type CourseTemplate = {
  course: { name: string; code: string | null; term: string | null };
  categories: Array<{ name: string; weight: number }>;
  items: Array<{
    kind: CourseTemplateItemKind;
    title: string;
    dueAt: string;
    endAt: string | null;
    scoreMax: number;
    estimatedEffortHours: number | null;
    /** Index into `categories`, or null for uncategorized items. */
    categoryIndex: number | null;
  }>;
};

export type CourseSharePreview = {
  course: CourseTemplate["course"];
  counts: Record<CourseTemplateItemKind, number>;
  categoryCount: number;
  /** The next few items due from `now`, soonest first. */
  upcoming: Array<{ kind: CourseTemplateItemKind; title: string; dueAt: string }>;
};

const KINDS = new Set<CourseTemplateItemKind>(["assignment", "quiz", "exam"]);
const MAX_TEXT = 200;
const MAX_CATEGORIES = 50;
const MAX_ITEMS = 500;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_TEXT) : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Maps the share snapshot (the `course_share_template` result) to a CourseTemplate, copying only
 * template fields. Returns null when the snapshot has no course name. Bad categories/items are
 * dropped rather than failing the whole join.
 */
export function courseTemplateFromSnapshot(value: unknown): CourseTemplate | null {
  const snapshot = record(value);
  const course = record(snapshot?.course);
  const name = text(course?.name);
  if (!snapshot || !course || !name) return null;

  const rawCategories = Array.isArray(snapshot.categories) ? snapshot.categories.slice(0, MAX_CATEGORIES) : [];
  // Snapshot index -> template index, since invalid categories are skipped.
  const categoryIndexMap = new Map<number, number>();
  const categories: CourseTemplate["categories"] = [];
  rawCategories.forEach((raw, index) => {
    const category = record(raw);
    const categoryName = text(category?.name);
    if (!categoryName) return;
    const weight = finiteNumber(category?.weight) ?? 0;
    categoryIndexMap.set(index, categories.length);
    categories.push({ name: categoryName, weight: Math.max(0, Math.min(100, weight)) });
  });

  const rawItems = Array.isArray(snapshot.items) ? snapshot.items.slice(0, MAX_ITEMS) : [];
  const items: CourseTemplate["items"] = [];
  for (const raw of rawItems) {
    const item = record(raw);
    const kind = item?.kind;
    const title = text(item?.title);
    const dueAt = isoDate(item?.dueAt);
    if (!item || !title || !dueAt || typeof kind !== "string" || !KINDS.has(kind as CourseTemplateItemKind)) continue;
    const endAt = isoDate(item.endAt);
    const scoreMax = finiteNumber(item.scoreMax);
    const effort = finiteNumber(item.estimatedEffortHours);
    const categoryIndex = finiteNumber(item.categoryIndex);
    items.push({
      kind: kind as CourseTemplateItemKind,
      title,
      dueAt,
      endAt: endAt && endAt >= dueAt ? endAt : null,
      scoreMax: scoreMax !== null && scoreMax > 0 ? scoreMax : 100,
      estimatedEffortHours: effort !== null && effort >= 0 ? effort : null,
      categoryIndex: categoryIndex === null ? null : categoryIndexMap.get(categoryIndex) ?? null,
    });
  }
  items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  return {
    course: { name, code: text(course.code), term: text(course.term) },
    categories,
    items,
  };
}

/** What the join page shows before a student adds the course. */
export function courseSharePreview(template: CourseTemplate, now: Date = new Date(), upcomingLimit = 3): CourseSharePreview {
  const counts: Record<CourseTemplateItemKind, number> = { exam: 0, quiz: 0, assignment: 0 };
  for (const item of template.items) counts[item.kind] += 1;
  const nowIso = now.toISOString();
  const upcoming = template.items
    .filter((item) => item.dueAt >= nowIso)
    .slice(0, upcomingLimit)
    .map(({ kind, title, dueAt }) => ({ kind, title, dueAt }));
  return { course: template.course, counts, categoryCount: template.categories.length, upcoming };
}

const COUNT_LABELS: Array<[CourseTemplateItemKind, string, string]> = [
  ["exam", "exam", "exams"],
  ["quiz", "quiz", "quizzes"],
  ["assignment", "assignment", "assignments"],
];

/** "2 exams · 3 quizzes · 8 assignments" (zero kinds left out), for the join preview. */
export function shareCountsLabel(counts: Record<CourseTemplateItemKind, number>): string {
  const parts = COUNT_LABELS.filter(([kind]) => counts[kind] > 0).map(
    ([kind, one, many]) => `${counts[kind]} ${counts[kind] === 1 ? one : many}`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No dated items yet";
}

/** Minimum random bytes in a share token (128 bits). */
export const SHARE_TOKEN_MIN_BYTES = 16;
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Encodes cryptographically random bytes as an unpadded base64url share token. The caller
 * supplies the bytes (node:crypto randomBytes on the server) so this stays platform-neutral.
 */
export function shareTokenFromBytes(bytes: Uint8Array): string {
  if (bytes.length < SHARE_TOKEN_MIN_BYTES) throw new Error(`Share tokens need at least ${SHARE_TOKEN_MIN_BYTES} random bytes.`);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let c = 0; c < chars; c += 1) out += BASE64URL[(n >> (18 - 6 * c)) & 63];
  }
  return out;
}

/** Cheap format check so malformed tokens 404 without a database lookup. */
export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && SHARE_TOKEN_PATTERN.test(value);
}

export function buildJoinUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/join/${token}`;
}

/**
 * The share token in a join link: atlas://join/<token> (also atlas:///join/<token>) or
 * https://<host>/join/<token>. Null for any other URL, including auth deep links.
 */
export function parseJoinLink(url: string): string | null {
  const match = /^(?:atlas:\/\/\/?|https?:\/\/[^/?#]+\/)join\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url.trim());
  return match && isShareToken(match[1]) ? match[1] : null;
}
