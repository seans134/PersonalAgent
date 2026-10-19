import { describe, expect, it } from "vitest";
import {
  countSyllabusItemsToApply,
  isSyllabusItemApplied,
  removeSyllabusCategory,
  renameSyllabusCategory,
  summarizeSyllabusWeights,
} from "./index";

const draft = {
  categories: [
    { name: "Homework", weight: 30, position: 0 },
    { name: "Exams", weight: 70, position: 1 },
  ],
  items: [
    { title: "HW 1", categoryName: "Homework", include: true, due_at: "2026-09-10T23:59:00.000Z" },
    { title: "Midterm", categoryName: "Exams", include: true, due_at: null },
    { title: "Reading", categoryName: null, include: false, due_at: "2026-09-12T23:59:00.000Z" },
  ],
};

describe("summarizeSyllabusWeights", () => {
  it("totals weights and accepts sums within half a point of 100", () => {
    expect(summarizeSyllabusWeights(draft.categories)).toEqual({ total: 100, isOff: false });
    expect(summarizeSyllabusWeights([{ weight: 33.3 }, { weight: 33.3 }, { weight: 33.3 }]).isOff).toBe(false);
  });

  it("flags sums that miss 100 and ignores non-finite weights", () => {
    expect(summarizeSyllabusWeights([{ weight: 20 }, { weight: 50 }])).toEqual({ total: 70, isOff: true });
    expect(summarizeSyllabusWeights([{ weight: Number.NaN }, { weight: 100 }])).toEqual({ total: 100, isOff: false });
  });

  it("does not flag an empty category list", () => {
    expect(summarizeSyllabusWeights([])).toEqual({ total: 0, isOff: false });
  });
});

describe("items to apply", () => {
  it("requires both include and a due date", () => {
    expect(draft.items.map(isSyllabusItemApplied)).toEqual([true, false, false]);
    expect(countSyllabusItemsToApply(draft.items)).toBe(1);
  });
});

describe("renameSyllabusCategory", () => {
  it("renames the category and relinks its items", () => {
    const next = renameSyllabusCategory(draft, 0, "Problem sets");
    expect(next.categories[0]).toEqual({ name: "Problem sets", weight: 30, position: 0 });
    expect(next.items.map((item) => item.categoryName)).toEqual(["Problem sets", "Exams", null]);
    expect(draft.categories[0].name).toBe("Homework");
  });

  it("ignores an out-of-range index", () => {
    expect(renameSyllabusCategory(draft, 5, "X")).toBe(draft);
  });
});

describe("removeSyllabusCategory", () => {
  it("removes the category and unlinks its items", () => {
    const next = removeSyllabusCategory(draft, 1);
    expect(next.categories.map((category) => category.name)).toEqual(["Homework"]);
    expect(next.items.map((item) => item.categoryName)).toEqual(["Homework", null, null]);
  });

  it("keeps links when another category has the same name", () => {
    const duplicated = { ...draft, categories: [...draft.categories, { name: "Exams", weight: 0, position: 2 }] };
    expect(removeSyllabusCategory(duplicated, 1).items[1].categoryName).toBe("Exams");
  });
});
