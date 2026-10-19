import { describe, expect, it } from "vitest";
import {
  addSyllabusCategory,
  countNamedSyllabusCategories,
  countSyllabusItemsToApply,
  fromSyllabusReview,
  isSyllabusItemApplied,
  removeSyllabusCategory,
  renameSyllabusCategory,
  summarizeSyllabusWeights,
  toSyllabusReview,
} from "./index";

const draft = {
  course: { name: "Chem" },
  categories: [
    { name: "Homework", weight: 30, position: 0 },
    { name: "Exams", weight: 70, position: 1 },
  ],
  items: [
    { title: "HW 1", categoryName: "homework", include: true, due_at: "2026-09-10T23:59:00.000Z" },
    { title: "Midterm", categoryName: "Exams", include: true, due_at: null },
    { title: "Reading", categoryName: null, include: false, due_at: "2026-09-12T23:59:00.000Z" },
    { title: "Lab", categoryName: "Labs", include: true, due_at: "2026-09-14T23:59:00.000Z" },
  ],
  warnings: [],
};

function itemCategories(review: ReturnType<typeof toSyllabusReview<typeof draft>>) {
  return fromSyllabusReview(review).items.map((item) => item.categoryName);
}

describe("toSyllabusReview / fromSyllabusReview", () => {
  it("keys categories and links items case-insensitively; unknown names become no category", () => {
    const review = toSyllabusReview(draft);
    expect(review.categories.map((category) => category.key)).toEqual(["c0", "c1"]);
    expect(review.items.map((item) => item.categoryKey)).toEqual(["c0", "c1", null, null]);
    expect(review.course).toEqual(draft.course);
  });

  it("round-trips back to a name-linked draft without keys", () => {
    const back = fromSyllabusReview(toSyllabusReview(draft));
    expect(back.categories).toEqual(draft.categories);
    expect(back.items.map((item) => item.categoryName)).toEqual(["Homework", "Exams", null, null]);
    expect(back.items[0]).not.toHaveProperty("categoryKey");
  });
});

describe("renameSyllabusCategory", () => {
  it("keeps groups apart when an intermediate name collides with another category", () => {
    let review = toSyllabusReview({
      ...draft,
      categories: [
        { name: "Quiz", weight: 10, position: 0 },
        { name: "Quizzes", weight: 90, position: 1 },
      ],
      items: [
        { title: "Q1", categoryName: "Quiz", include: true, due_at: "2026-09-10T23:59:00.000Z" },
        { title: "Pop", categoryName: "Quizzes", include: true, due_at: "2026-09-11T23:59:00.000Z" },
      ],
    });
    for (const name of ["Quizze", "Quizz", "Quiz", "Quiz ", "Quiz B"]) {
      review = renameSyllabusCategory(review, "c1", name);
    }
    expect(review.categories.map((category) => category.name)).toEqual(["Quiz", "Quiz B"]);
    expect(itemCategories(review)).toEqual(["Quiz", "Quiz B"]);
  });

  it("keeps groups apart when two names are cleared to empty", () => {
    let review = toSyllabusReview(draft);
    review = renameSyllabusCategory(review, "c0", "");
    review = renameSyllabusCategory(review, "c1", "");
    expect(itemCategories(review)).toEqual([null, null, null, null]);
    review = renameSyllabusCategory(review, "c0", "Problem sets");
    expect(itemCategories(review)).toEqual(["Problem sets", null, null, null]);
    review = renameSyllabusCategory(review, "c1", "Tests");
    expect(itemCategories(review)).toEqual(["Problem sets", "Tests", null, null]);
  });
});

describe("addSyllabusCategory / removeSyllabusCategory", () => {
  it("unlinks the removed category's items only", () => {
    const review = removeSyllabusCategory(toSyllabusReview(draft), "c1");
    expect(review.categories.map((category) => category.name)).toEqual(["Homework"]);
    expect(itemCategories(review)).toEqual(["Homework", null, null, null]);
  });

  it("gives an added category a key no other category uses", () => {
    let review = removeSyllabusCategory(toSyllabusReview(draft), "c0");
    review = addSyllabusCategory(review, { name: "", weight: 0, position: 1 });
    review = addSyllabusCategory(review, { name: "", weight: 0, position: 2 });
    const keys = review.categories.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["c1", "c2", "c3"]);
  });
});

describe("countNamedSyllabusCategories", () => {
  it("skips blank names", () => {
    expect(countNamedSyllabusCategories([{ name: "A" }, { name: "  " }, { name: "" }])).toBe(1);
  });
});

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
    expect(draft.items.map(isSyllabusItemApplied)).toEqual([true, false, false, true]);
    expect(countSyllabusItemsToApply(draft.items)).toBe(2);
  });
});
