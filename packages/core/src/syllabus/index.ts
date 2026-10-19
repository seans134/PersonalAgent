// Shared review-step logic for syllabus import (web panel and mobile screen).
// Structural types so both the web SyllabusDraft and mobile MobileSyllabusDraft fit.

type ReviewCategory = { name: string; weight: number };
type ReviewItem = { include: boolean; due_at: string | null; categoryName: string | null };
type ReviewDraft = {
  categories: ReadonlyArray<{ name: string }>;
  items: ReadonlyArray<{ categoryName: string | null }>;
};

/** Weights within this many points of 100 count as summing to 100 (matches validateSyllabusDraft). */
export const SYLLABUS_WEIGHT_TOLERANCE = 0.5;

export type SyllabusWeightSummary = { total: number; isOff: boolean };

/** Total category weight; isOff when there are categories and they don't add up to 100. */
export function summarizeSyllabusWeights(categories: ReadonlyArray<Pick<ReviewCategory, "weight">>): SyllabusWeightSummary {
  const total = categories.reduce((sum, category) => sum + (Number.isFinite(category.weight) ? category.weight : 0), 0);
  return { total, isOff: categories.length > 0 && Math.abs(total - 100) > SYLLABUS_WEIGHT_TOLERANCE };
}

/** Apply saves an item only when it's marked for inclusion and has a due date (course_items.due_at is NOT NULL). */
export function isSyllabusItemApplied(item: Pick<ReviewItem, "include" | "due_at">): boolean {
  return item.include && Boolean(item.due_at);
}

export function countSyllabusItemsToApply(items: ReadonlyArray<Pick<ReviewItem, "include" | "due_at">>): number {
  return items.filter(isSyllabusItemApplied).length;
}

/**
 * Renames a category and keeps items linked to it. Items reference categories by name, so a plain
 * rename would silently drop them to "no category" at apply time.
 */
export function renameSyllabusCategory<D extends ReviewDraft>(draft: D, index: number, name: string): D {
  const previous = draft.categories[index];
  if (!previous) return draft;
  return {
    ...draft,
    categories: draft.categories.map((category, i) => (i === index ? { ...category, name } : category)),
    items: draft.items.map((item) => (item.categoryName === previous.name ? { ...item, categoryName: name } : item)),
  } as D;
}

/** Removes a category; items that pointed at it fall back to no category (unless another category shares the name). */
export function removeSyllabusCategory<D extends ReviewDraft>(draft: D, index: number): D {
  const removed = draft.categories[index];
  if (!removed) return draft;
  const categories = draft.categories.filter((_, i) => i !== index);
  const nameStillUsed = categories.some((category) => category.name === removed.name);
  return {
    ...draft,
    categories,
    items: nameStillUsed
      ? draft.items
      : draft.items.map((item) => (item.categoryName === removed.name ? { ...item, categoryName: null } : item)),
  } as D;
}
