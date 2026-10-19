// Shared review-step logic for syllabus import (web panel and mobile screen).
// Structural types so both the web SyllabusDraft and mobile MobileSyllabusDraft fit.
//
// The parsed draft links items to categories by name. While the student edits, names change on
// every keystroke, so review state links items by a stable per-category key instead and only
// maps key -> name when building the draft for apply (fromSyllabusReview).

type DraftLike = {
  categories: ReadonlyArray<{ name: string }>;
  items: ReadonlyArray<{ categoryName: string | null }>;
};

type ReviewLike = {
  categories: ReadonlyArray<{ key: string; name: string }>;
  items: ReadonlyArray<{ categoryKey: string | null }>;
};

export type SyllabusReview<D extends DraftLike> = Omit<D, "categories" | "items"> & {
  categories: Array<D["categories"][number] & { key: string }>;
  items: Array<Omit<D["items"][number], "categoryName"> & { categoryKey: string | null }>;
};

export type SyllabusDraftFromReview<R extends ReviewLike> = Omit<R, "categories" | "items"> & {
  categories: Array<Omit<R["categories"][number], "key">>;
  items: Array<Omit<R["items"][number], "categoryKey"> & { categoryName: string | null }>;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Gives each category a stable key and links items by key (case-insensitive name match, first wins like apply). */
export function toSyllabusReview<D extends DraftLike>(draft: D): SyllabusReview<D> {
  const categories = draft.categories.map((category, index) => ({ ...category, key: `c${index}` }));
  const keyByName = new Map<string, string>();
  for (const category of categories) {
    const name = normalizeName(category.name);
    if (name && !keyByName.has(name)) keyByName.set(name, category.key);
  }
  const items = draft.items.map(({ categoryName, ...rest }) => ({
    ...rest,
    categoryKey: categoryName ? keyByName.get(normalizeName(categoryName)) ?? null : null,
  }));
  return { ...draft, categories, items } as unknown as SyllabusReview<D>;
}

/** Drops the keys and links items back by the category's current name (blank or missing -> no category). */
export function fromSyllabusReview<R extends ReviewLike>(review: R): SyllabusDraftFromReview<R> {
  const nameByKey = new Map(review.categories.map((category) => [category.key, category.name] as const));
  const categories = review.categories.map((category) => {
    const rest: Partial<typeof category> = { ...category };
    delete rest.key;
    return rest;
  });
  const items = review.items.map(({ categoryKey, ...rest }) => {
    const name = categoryKey ? nameByKey.get(categoryKey) : undefined;
    return { ...rest, categoryName: name?.trim() ? name : null };
  });
  return { ...review, categories, items } as unknown as SyllabusDraftFromReview<R>;
}

/** A key no category in the list uses yet. */
export function nextSyllabusCategoryKey(categories: ReadonlyArray<{ key: string }>): string {
  const used = new Set(categories.map((category) => category.key));
  let index = categories.length;
  while (used.has(`c${index}`)) index += 1;
  return `c${index}`;
}

export function addSyllabusCategory<R extends ReviewLike>(review: R, category: Omit<R["categories"][number], "key">): R {
  const key = nextSyllabusCategoryKey(review.categories);
  return { ...review, categories: [...review.categories, { ...category, key }] };
}

/** Renaming touches only the category; items follow it by key. */
export function renameSyllabusCategory<R extends ReviewLike>(review: R, key: string, name: string): R {
  return {
    ...review,
    categories: review.categories.map((category) => (category.key === key ? { ...category, name } : category)),
  };
}

/** Removes a category; its items fall back to no category. */
export function removeSyllabusCategory<R extends ReviewLike>(review: R, key: string): R {
  return {
    ...review,
    categories: review.categories.filter((category) => category.key !== key),
    items: review.items.map((item) => (item.categoryKey === key ? { ...item, categoryKey: null } : item)),
  };
}

/** Categories apply will actually create (it drops blank names). */
export function countNamedSyllabusCategories(categories: ReadonlyArray<{ name: string }>): number {
  return categories.filter((category) => category.name.trim()).length;
}

/** Weights within this many points of 100 count as summing to 100 (matches validateSyllabusDraft). */
export const SYLLABUS_WEIGHT_TOLERANCE = 0.5;

export type SyllabusWeightSummary = { total: number; isOff: boolean };

/** Total category weight; isOff when there are categories and they don't add up to 100. */
export function summarizeSyllabusWeights(categories: ReadonlyArray<{ weight: number }>): SyllabusWeightSummary {
  const total = categories.reduce((sum, category) => sum + (Number.isFinite(category.weight) ? category.weight : 0), 0);
  return { total, isOff: categories.length > 0 && Math.abs(total - 100) > SYLLABUS_WEIGHT_TOLERANCE };
}

/** Apply saves an item only when it's marked for inclusion and has a due date (course_items.due_at is NOT NULL). */
export function isSyllabusItemApplied(item: { include: boolean; due_at: string | null }): boolean {
  return item.include && Boolean(item.due_at);
}

export function countSyllabusItemsToApply(items: ReadonlyArray<{ include: boolean; due_at: string | null }>): number {
  return items.filter(isSyllabusItemApplied).length;
}
