import { describe, expect, it } from "vitest";
import {
  buildSemesterTimeline,
  defaultSemesterTerm,
  formatSemesterDueDay,
  formatSemesterLoad,
  formatSemesterWeekRange,
  itemWeightPercents,
  semesterCrunchLabel,
  semesterItemMeta,
  semesterTerms,
  weekStartOf,
  type SemesterCourse,
  type SemesterItemInput,
} from "./semester";

// 2026-10-19 is a Monday.
const today = "2026-10-21";

const course = (id: string, term: string | null, code: string | null = null): SemesterCourse => ({
  id, name: `Course ${id}`, code, term,
});
const item = (id: string, courseId: string, dueLocalDate: string, overrides: Partial<SemesterItemInput> = {}): SemesterItemInput => ({
  id, courseId, categoryId: null, kind: "assignment", title: id,
  dueAt: `${dueLocalDate}T15:00:00.000Z`, dueLocalDate, scoreEarned: null, estimatedEffortHours: null,
  ...overrides,
});

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-21")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("semesterTerms and defaultSemesterTerm", () => {
  const courses = [course("a", "Fall 2026"), course("b", " fall  2026 "), course("c", "Winter 2027"), course("d", null)];

  it("merges spellings and orders terms by their earliest item", () => {
    const items = [item("w", "c", "2027-01-15"), item("f", "b", "2026-09-10")];
    expect(semesterTerms(courses, items)).toEqual(["Fall 2026", "Winter 2027"]);
    expect(semesterTerms([course("x", "Spring"), course("y", "Autumn")], [])).toEqual(["Autumn", "Spring"]);
  });

  it("picks the term with items closest to today", () => {
    const items = [item("f", "a", "2026-10-30"), item("w", "c", "2027-01-15")];
    expect(defaultSemesterTerm(courses, items, today)).toBe("Fall 2026");
    expect(defaultSemesterTerm(courses, items, "2027-01-01")).toBe("Winter 2027");
  });

  it("prefers an upcoming item on a tie and any term with items over one without", () => {
    const items = [item("past", "a", "2026-10-18"), item("next", "c", "2026-10-24")];
    expect(defaultSemesterTerm(courses, items, today)).toBe("Winter 2027");
    expect(defaultSemesterTerm([course("x", "Alpha"), course("y", "Beta")], [item("b", "y", "2020-01-01")], today)).toBe("Beta");
    expect(defaultSemesterTerm([course("d", null)], [item("x", "d", today)], today)).toBeNull();
  });
});

describe("itemWeightPercents", () => {
  it("splits a category's weight across its items", () => {
    const weights = itemWeightPercents(
      [{ id: "hw", courseId: "a", weight: 30 }, { id: "ex", courseId: "a", weight: 40 }],
      [
        { id: "h1", categoryId: "hw" }, { id: "h2", categoryId: "hw" }, { id: "h3", categoryId: "hw" },
        { id: "mid", categoryId: "ex" }, { id: "loose", categoryId: null }, { id: "gone", categoryId: "missing" },
      ],
    );
    expect(weights.get("h1")).toBe(10);
    expect(weights.get("mid")).toBe(40);
    expect(weights.get("loose")).toBeNull();
    expect(weights.get("gone")).toBeNull();
  });
});

describe("buildSemesterTimeline", () => {
  it("lays out weeks from the current week through the last item, empty weeks included", () => {
    const timeline = buildSemesterTimeline({
      courses: [course("a", "Fall 2026", "CHEM 201")],
      categories: [{ id: "ex", courseId: "a", weight: 50 }],
      items: [
        item("hw1", "a", "2026-10-23"),
        item("final", "a", "2026-11-04", { kind: "exam", categoryId: "ex", title: "Final" }),
      ],
      todayLocalDate: today,
    });
    expect(timeline.term).toBe("Fall 2026");
    expect(timeline.terms).toEqual(["Fall 2026"]);
    expect(timeline.weeks.map((week) => week.weekStart)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(timeline.weeks[0]).toMatchObject({ weekEnd: "2026-10-25", isCurrent: true, loadHours: 3, examCount: 0 });
    expect(timeline.weeks[1].items).toEqual([]);
    expect(timeline.weeks[2].items[0]).toMatchObject({
      id: "final", courseId: "a", courseLabel: "CHEM 201", kind: "exam", weightPercent: 50, effortHours: 6, isDone: false,
    });
    expect(timeline.pastWeeks).toEqual([]);
  });

  it("keeps past weeks with items separate and marks scored items done", () => {
    const timeline = buildSemesterTimeline({
      courses: [course("a", null)],
      categories: [],
      items: [
        item("old", "a", "2026-09-30", { scoreEarned: 90 }),
        item("monday", "a", "2026-10-19", { scoreEarned: 80 }),
        item("next", "a", "2026-10-28", { estimatedEffortHours: 5 }),
      ],
      todayLocalDate: today,
    });
    expect(timeline.term).toBeNull();
    expect(timeline.pastWeeks.map((week) => week.weekStart)).toEqual(["2026-09-28"]);
    expect(timeline.pastWeeks[0].items[0].isDone).toBe(true);
    expect(timeline.weeks[0].items.map((i) => [i.id, i.isDone])).toEqual([["monday", true]]);
    expect(timeline.weeks[1].loadHours).toBe(5);
  });

  it("returns no upcoming weeks when the term is over", () => {
    const timeline = buildSemesterTimeline({
      courses: [course("a", "Spring 2026")],
      categories: [],
      items: [item("x", "a", "2026-04-20")],
      todayLocalDate: today,
    });
    expect(timeline.weeks).toEqual([]);
    expect(timeline.pastWeeks).toHaveLength(1);
    expect(timeline.crunchWeekCount).toBe(0);
  });

  it("flags weeks with two exams or a load well above the term median", () => {
    const timeline = buildSemesterTimeline({
      courses: [course("a", "Fall"), course("b", "Fall")],
      categories: [],
      items: [
        item("q1", "a", "2026-10-22", { kind: "quiz" }),
        item("a1", "a", "2026-10-28"),
        item("big1", "a", "2026-11-03", { estimatedEffortHours: 6 }),
        item("big2", "b", "2026-11-05", { estimatedEffortHours: 4 }),
        item("mid1", "a", "2026-11-11", { kind: "exam", estimatedEffortHours: 1 }),
        item("mid2", "b", "2026-11-12", { kind: "exam", estimatedEffortHours: 1 }),
      ],
      todayLocalDate: today,
    });
    // Loads: 2, 3, 10, 2 -> median 2.5.
    expect(timeline.medianLoadHours).toBe(2.5);
    expect(timeline.weeks.map((week) => [week.loadHours, week.isCrunch])).toEqual([
      [2, false], [3, false], [10, true], [2, true],
    ]);
    expect(timeline.crunchWeekCount).toBe(2);
  });

  it("does not call a slightly heavier light week a crunch", () => {
    const timeline = buildSemesterTimeline({
      courses: [course("a", null)],
      categories: [],
      items: [item("q", "a", "2026-10-22", { kind: "quiz" }), item("hw", "a", "2026-10-29", { estimatedEffortHours: 4 })],
      todayLocalDate: today,
    });
    expect(timeline.weeks.map((week) => week.isCrunch)).toEqual([false, false]);
  });

  it("shows the requested term, grouping untermed courses only under the default", () => {
    const courses = [course("fall", "Fall 2026"), course("winter", "Winter 2027"), course("none", null)];
    const items = [
      item("f", "fall", "2026-10-30"),
      item("w", "winter", "2027-01-20"),
      item("n", "none", "2026-11-02"),
    ];
    const byDefault = buildSemesterTimeline({ courses, categories: [], items, todayLocalDate: today });
    expect(byDefault.term).toBe("Fall 2026");
    expect(byDefault.terms).toEqual(["Fall 2026", "Winter 2027"]);
    expect(byDefault.weeks.flatMap((week) => week.items.map((i) => i.id))).toEqual(["f", "n"]);

    const winter = buildSemesterTimeline({ courses, categories: [], items, todayLocalDate: today, requestedTerm: "winter 2027" });
    expect(winter.term).toBe("Winter 2027");
    expect(winter.weeks.flatMap((week) => week.items.map((i) => i.id))).toEqual(["w"]);
    expect(winter.weeks[0].weekStart).toBe("2026-10-19");

    const unknown = buildSemesterTimeline({ courses, categories: [], items, todayLocalDate: today, requestedTerm: "Summer" });
    expect(unknown.term).toBe("Fall 2026");
  });
});

describe("semester formatting", () => {
  it("formats week ranges, due days, load and crunch labels", () => {
    expect(formatSemesterWeekRange({ weekStart: "2026-10-19", weekEnd: "2026-10-25" })).toBe("Oct 19 – 25");
    expect(formatSemesterWeekRange({ weekStart: "2026-10-26", weekEnd: "2026-11-01" })).toBe("Oct 26 – Nov 1");
    expect(formatSemesterDueDay("2026-10-21")).toBe("Wed Oct 21");
    expect(formatSemesterLoad({ loadHours: 0, items: [] })).toBe("Nothing due");
    expect(formatSemesterLoad({ loadHours: 10, items: [{} as never] })).toBe("About 10 h of study");
    expect(formatSemesterLoad({ loadHours: 2.5, items: [{} as never] })).toBe("About 2.5 h of study");
    expect(semesterCrunchLabel({ isCrunch: false, examCount: 0 })).toBeNull();
    expect(semesterCrunchLabel({ isCrunch: true, examCount: 2 })).toBe("Crunch week · 2 exams");
    expect(semesterCrunchLabel({ isCrunch: true, examCount: 1 })).toBe("Crunch week · heavy load");
    expect(semesterItemMeta({ kind: "exam", weightPercent: 25 })).toBe("Exam · 25%");
    expect(semesterItemMeta({ kind: "assignment", weightPercent: null })).toBe("Assignment");
  });
});
