import { describe, expect, it } from "vitest";
import { BRIGHTSPACE_FEED, CANVAS_FEED, MOODLE_FEED } from "./fixtures";
import { parseICalendar, type ICalEvent } from "./ical";
import {
  cleanLmsTitle,
  courseTokens,
  isLmsDeadlineEvent,
  learnedCourseHints,
  lmsDeadlineFromEvent,
  lmsDeadlineKind,
  lmsDeadlinesFromEvents,
  matchLmsCourse,
  planLmsFeedSync,
  resolveICalDate,
  resolveTimeZoneId,
  splitCourseTag,
  zonedTimeToIso,
  type LmsCourseRef,
  type LmsDeadline,
  type LmsFeedItemRecord,
} from "./deadlines";

const zones = { student: "America/Toronto" };
const now = new Date("2026-10-20T12:00:00.000Z");

const courses: LmsCourseRef[] = [
  { id: "cs", name: "Intro to Programming", code: "CS 101" },
  { id: "chem", name: "Organic Chemistry", code: "CHEM 201" },
  { id: "engl", name: "Academic Writing", code: "ENGL110" },
  { id: "hist", name: "Modern Europe", code: null },
];

function event(overrides: Partial<ICalEvent>): ICalEvent {
  return {
    component: "VEVENT",
    uid: "uid-1",
    summary: "Homework 1",
    location: null,
    categories: [],
    url: null,
    start: { kind: "utc", iso: "2026-10-25T03:59:00.000Z" },
    end: null,
    due: null,
    status: null,
    recurring: false,
    recurrenceOverride: false,
    ...overrides,
  };
}

function deadline(overrides: Partial<LmsDeadline> = {}): LmsDeadline {
  return {
    uid: "event-assignment-1",
    kind: "assignment",
    title: "Problem Set 1",
    dueAt: "2026-10-25T03:59:00.000Z",
    endAt: null,
    courseHint: "CS 101",
    matchTexts: ["CS 101", "Problem Set 1 [CS 101]"],
    ...overrides,
  };
}

function record(overrides: Partial<LmsFeedItemRecord> = {}): LmsFeedItemRecord {
  return {
    id: "rec-1",
    uid: "event-assignment-1",
    status: "imported",
    courseItemId: "item-1",
    courseId: "cs",
    kind: "assignment",
    title: "Problem Set 1",
    dueAt: "2026-10-25T03:59:00.000Z",
    endAt: null,
    courseHint: "CS 101",
    ...overrides,
  };
}

describe("time zones", () => {
  it("converts wall-clock times across DST", () => {
    expect(zonedTimeToIso("2026-11-02", "23:59", "America/New_York")).toBe("2026-11-03T04:59:00.000Z");
    expect(zonedTimeToIso("2026-10-20", "23:59", "America/New_York")).toBe("2026-10-21T03:59:00.000Z");
    expect(zonedTimeToIso("2026-07-01", "09:00:00", "UTC")).toBe("2026-07-01T09:00:00.000Z");
  });

  it("resolves IANA, prefixed and Windows TZIDs", () => {
    expect(resolveTimeZoneId("America/Chicago")).toBe("America/Chicago");
    expect(resolveTimeZoneId("/mozilla.org/20050126_1/America/New_York")).toBe("America/New_York");
    expect(resolveTimeZoneId("Pacific Standard Time")).toBe("America/Los_Angeles");
    expect(resolveTimeZoneId("Not/AZone")).toBeNull();
    expect(resolveTimeZoneId(null)).toBeNull();
  });

  it("puts all-day deadlines at 23:59 in the student's zone and floating times in the calendar zone", () => {
    expect(resolveICalDate({ kind: "date", date: "2026-11-04" }, zones)).toBe("2026-11-05T04:59:00.000Z");
    expect(resolveICalDate({ kind: "local", date: "2026-11-01", time: "12:00:00", tzid: null }, { student: "UTC", calendar: "America/Chicago" })).toBe(
      "2026-11-01T18:00:00.000Z",
    );
    // An unknown TZID falls back to the calendar zone, then the student's.
    expect(resolveICalDate({ kind: "local", date: "2026-11-01", time: "12:00:00", tzid: "Mars/Base" }, { student: "UTC" })).toBe(
      "2026-11-01T12:00:00.000Z",
    );
  });
});

describe("classifying events", () => {
  it("knows deadline kinds", () => {
    expect(lmsDeadlineKind("Midterm Exam")).toBe("exam");
    expect(lmsDeadlineKind("Final")).toBe("exam");
    expect(lmsDeadlineKind("Final Project")).toBe("assignment");
    expect(lmsDeadlineKind("Quiz 3")).toBe("quiz");
    expect(lmsDeadlineKind("Essay 1")).toBe("assignment");
    expect(lmsDeadlineKind("Final Exam")).toBe("exam");
    expect(lmsDeadlineKind("Test 2")).toBe("exam");
    expect(lmsDeadlineKind("Unit 3 Test")).toBe("exam");
    expect(lmsDeadlineKind("Finals week study plan")).toBe("exam");
  });

  it("doesn't treat a loose \"final\" or \"test\" as an exam", () => {
    expect(lmsDeadlineKind("Final grades posted")).toBe("assignment");
    expect(lmsDeadlineKind("Test your microphone")).toBe("assignment");
    expect(isLmsDeadlineEvent(event({ summary: "Final grades posted" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Test your microphone" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Final [CHEM 201]" }))).toBe(true);
    expect(isLmsDeadlineEvent(event({ summary: "Test 1 [BIO 150]" }))).toBe(true);
    expect(lmsDeadlineFromEvent(event({ summary: "Final [CHEM 201]" }), zones)?.kind).toBe("exam");
  });

  it("accepts Canvas assignments and deadline wording; rejects availability, lectures, recurring and cancelled events", () => {
    expect(isLmsDeadlineEvent(event({ uid: "event-assignment-9", summary: "Week 3 check-in" }))).toBe(true);
    expect(isLmsDeadlineEvent(event({ summary: "Lab report 2 is due" }))).toBe(true);
    expect(isLmsDeadlineEvent(event({ summary: "Quiz 1 - Availability Ends" }))).toBe(true);
    expect(isLmsDeadlineEvent(event({ summary: "Quiz 4 opens" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Quiz 1 - Availability Starts" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Office Hours" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Guest speaker" }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Homework", recurring: true }))).toBe(false);
    expect(isLmsDeadlineEvent(event({ summary: "Exam", status: "CANCELLED" }))).toBe(false);
  });

  it("splits the Canvas course tag and cleans LMS suffixes", () => {
    expect(splitCourseTag("Problem Set 4 [CS 101-001]")).toEqual({ title: "Problem Set 4", tag: "CS 101-001" });
    expect(splitCourseTag("[CS 101]")).toEqual({ title: "[CS 101]", tag: null });
    expect(splitCourseTag("No tag")).toEqual({ title: "No tag", tag: null });
    expect(cleanLmsTitle("Lab report 2 is due")).toBe("Lab report 2");
    expect(cleanLmsTitle("Quiz 1 - Availability Ends")).toBe("Quiz 1");
    expect(cleanLmsTitle("Essay - Due")).toBe("Essay");
    expect(cleanLmsTitle("x".repeat(300))).toHaveLength(200);
  });
});

describe("lmsDeadlineFromEvent", () => {
  it("turns the Canvas sample into deadlines", () => {
    const parsed = parseICalendar(CANVAS_FEED);
    const deadlines = lmsDeadlinesFromEvents(parsed.events, zones);
    expect(deadlines.map((d) => [d.uid, d.kind, d.title, d.dueAt, d.endAt, d.courseHint])).toEqual([
      ["event-assignment-501234", "assignment", "Problem Set 4", "2026-10-23T03:59:00.000Z", null, "CS 101-001 Intro to Programming"],
      // All-day exam: 23:59 Toronto time, no window.
      ["event-calendar-event-77001", "exam", "Midterm Exam", "2026-11-05T04:59:00.000Z", null, "CHEM 201"],
      [
        "event-assignment-501300",
        "assignment",
        "Essay, draft 2: Compare and contrast the two readings from week six",
        "2026-10-30T03:59:00.000Z",
        null,
        "ENGL 110",
      ],
      // Timed quiz keeps its window.
      ["event-calendar-event-77003", "quiz", "Quiz 3", "2026-10-28T16:30:00.000Z", "2026-10-28T17:00:00.000Z", "BIO 150"],
    ]);
  });

  it("reads Moodle categories and Brightspace TZIDs and locations", () => {
    const moodle = lmsDeadlinesFromEvents(parseICalendar(MOODLE_FEED).events, zones);
    expect(moodle).toHaveLength(1);
    expect(moodle[0]).toMatchObject({ title: "Lab report 2", courseHint: "PHYS 120", dueAt: "2026-11-01T22:59:00.000Z" });

    const brightspace = lmsDeadlinesFromEvents(parseICalendar(BRIGHTSPACE_FEED).events, zones);
    expect(brightspace).toHaveLength(1);
    expect(brightspace[0]).toMatchObject({
      kind: "quiz",
      title: "Quiz 1",
      dueAt: "2026-11-03T04:59:00.000Z",
      courseHint: "HIST 210 - Modern Europe",
    });
  });

  it("uses DUE for VTODO and skips events without a date", () => {
    const todo = event({ component: "VTODO", start: null, due: { kind: "utc", iso: "2026-11-01T00:00:00.000Z" } });
    expect(lmsDeadlineFromEvent(todo, zones)?.dueAt).toBe("2026-11-01T00:00:00.000Z");
    expect(lmsDeadlineFromEvent(event({ start: null }), zones)).toBeNull();
  });

  it("drops exam windows that end before they start or run over 12 hours", () => {
    const start = { kind: "utc" as const, iso: "2026-11-01T10:00:00.000Z" };
    expect(lmsDeadlineFromEvent(event({ summary: "Exam", start, end: { kind: "utc", iso: "2026-11-01T09:00:00.000Z" } }), zones)?.endAt).toBeNull();
    expect(lmsDeadlineFromEvent(event({ summary: "Exam", start, end: { kind: "utc", iso: "2026-11-02T10:00:00.000Z" } }), zones)?.endAt).toBeNull();
  });
});

describe("matchLmsCourse", () => {
  const match = (hint: string | null, summary: string, learned?: Map<string, string>) =>
    matchLmsCourse({ courseHint: hint, matchTexts: [...(hint ? [hint] : []), summary] }, courses, learned);

  it("matches course codes in the tag regardless of spacing, dashes and sections", () => {
    expect(match("CS 101-001 Intro to Programming", "Problem Set 4")).toBe("cs");
    expect(match("CS101", "x")).toBe("cs");
    expect(match("ENGL 110", "Essay")).toBe("engl");
    expect(match("chem-201-F26", "Midterm")).toBe("chem");
  });

  it("doesn't match a code that's only a prefix of another number", () => {
    expect(match("CS 1010", "Homework")).toBeNull();
  });

  it("matches the course name when there's no code", () => {
    expect(match("HIST 210 - Modern Europe", "Quiz 1")).toBe("hist");
  });

  it("falls back to a code in the summary", () => {
    expect(match(null, "CHEM 201 Lab report")).toBe("chem");
    expect(match(null, "Lab report")).toBeNull();
  });

  it("returns null when two courses match equally", () => {
    const twins: LmsCourseRef[] = [
      { id: "a", name: "Calculus", code: "MATH 100" },
      { id: "b", name: "Calculus II", code: "MATH 100" },
    ];
    expect(matchLmsCourse({ courseHint: "MATH 100", matchTexts: ["MATH 100", "HW"] }, twins)).toBeNull();
  });

  it("prefers the longer of two nested codes", () => {
    const nested: LmsCourseRef[] = [
      { id: "short", name: "Bio", code: "BIO 1" },
      { id: "long", name: "Bio lab", code: "BIO 1 L" },
    ];
    expect(matchLmsCourse({ courseHint: "BIO 1 L", matchTexts: ["BIO 1 L", "Lab"] }, nested)).toBe("long");
  });

  it("uses hints the student already assigned", () => {
    expect(match("Section 7", "HW", new Map([["section 7", "hist"]]))).toBe("hist");
    // A learned course that no longer exists is ignored.
    expect(match("Section 7", "HW", new Map([["section 7", "gone"]]))).toBeNull();
  });

  it("tokenizes letters and digits separately", () => {
    expect(courseTokens("CS-101_001F26")).toEqual(["cs", "101", "001", "f", "26"]);
  });
});

describe("learnedCourseHints", () => {
  it("maps hints to their course and drops conflicting ones", () => {
    const learned = learnedCourseHints(
      [
        record({ id: "1", courseHint: "Section 7", courseId: "hist" }),
        record({ id: "2", courseHint: "section-7", courseId: "hist" }),
        record({ id: "3", courseHint: "Shared", courseId: "cs" }),
        record({ id: "4", courseHint: "Shared", courseId: "chem" }),
        record({ id: "5", courseHint: "Old", courseId: "archived" }),
      ],
      courses,
    );
    expect(Object.fromEntries(learned)).toEqual({ "section 7": "hist" });
  });
});

describe("planLmsFeedSync", () => {
  it("creates matched deadlines and holds unmatched ones on first sync", () => {
    const plan = planLmsFeedSync({
      deadlines: [deadline(), deadline({ uid: "u2", courseHint: "PHYS 120", matchTexts: ["PHYS 120", "Lab"] })],
      records: [],
      courses,
      now,
      eventCount: 5,
    });
    expect(plan.create).toEqual([{ deadline: deadline(), courseId: "cs", recordId: null }]);
    expect(plan.addNeedsCourse.map((d) => d.uid)).toEqual(["u2"]);
    expect(plan.counts).toEqual({ events: 5, deadlines: 2, added: 1, updated: 0, needsCourse: 1 });
  });

  it("is idempotent: the same feed again changes nothing", () => {
    const plan = planLmsFeedSync({ deadlines: [deadline()], records: [record()], courses, now });
    expect(plan.create).toEqual([]);
    expect(plan.updateItems).toEqual([]);
    expect(plan.refresh).toEqual([]);
    expect(plan.counts.added + plan.counts.updated).toBe(0);
  });

  it("treats the same instant in another format as unchanged", () => {
    const plan = planLmsFeedSync({ deadlines: [deadline()], records: [record({ dueAt: "2026-10-25T03:59:00+00:00" })], courses, now });
    expect(plan.updateItems).toEqual([]);
  });

  it("updates the course item when the feed moves the due date or renames it", () => {
    const moved = deadline({ dueAt: "2026-10-27T03:59:00.000Z", title: "Problem Set 1 (extended)" });
    const plan = planLmsFeedSync({ deadlines: [moved], records: [record()], courses, now });
    expect(plan.updateItems).toEqual([
      {
        recordId: "rec-1",
        courseItemId: "item-1",
        patch: { title: "Problem Set 1 (extended)", due_at: "2026-10-27T03:59:00.000Z", end_at: null },
      },
    ]);
    expect(plan.refresh).toEqual([{ recordId: "rec-1", deadline: moved }]);
    expect(plan.counts.updated).toBe(1);
  });

  it("never re-creates an item the student deleted", () => {
    const plan = planLmsFeedSync({ deadlines: [deadline()], records: [record({ courseItemId: null })], courses, now });
    expect(plan.create).toEqual([]);
    expect(plan.markRemoved).toEqual(["rec-1"]);
    const again = planLmsFeedSync({ deadlines: [deadline()], records: [record({ status: "removed", courseItemId: null })], courses, now });
    expect(again.create).toEqual([]);
    expect(again.markRemoved).toEqual([]);
  });

  it("keeps skipped events skipped", () => {
    const plan = planLmsFeedSync({
      deadlines: [deadline({ dueAt: "2026-10-26T03:59:00.000Z" })],
      records: [record({ status: "skipped", courseItemId: null, courseId: null })],
      courses,
      now,
    });
    expect(plan.create).toEqual([]);
    expect(plan.updateItems).toEqual([]);
    expect(plan.refresh).toHaveLength(1);
  });

  it("matches a waiting event once its course exists, and drops waiting events that left the feed", () => {
    const waiting = record({ id: "w1", uid: "event-assignment-1", status: "needs_course", courseItemId: null, courseId: null });
    const gone = record({ id: "w2", uid: "gone", status: "needs_course", courseItemId: null, courseId: null });
    const plan = planLmsFeedSync({ deadlines: [deadline()], records: [waiting, gone], courses, now });
    expect(plan.create).toEqual([{ deadline: deadline(), courseId: "cs", recordId: "w1" }]);
    expect(plan.dropNeedsCourse).toEqual(["w2"]);
    expect(plan.counts.needsCourse).toBe(0);
  });

  it("follows a hint the student assigned before", () => {
    const assigned = record({ id: "a", uid: "old", courseHint: "Section 7", courseId: "hist" });
    const next = deadline({ uid: "new", courseHint: "Section 7", matchTexts: ["Section 7", "HW 2"] });
    const plan = planLmsFeedSync({ deadlines: [next], records: [assigned], courses, now });
    expect(plan.create.map((entry) => entry.courseId)).toEqual(["hist"]);
  });

  it("leaves out new events outside the import window but still updates known ones", () => {
    const old = deadline({ uid: "old", dueAt: "2026-09-01T00:00:00.000Z" });
    const far = deadline({ uid: "far", dueAt: "2028-01-01T00:00:00.000Z" });
    const knownOld = deadline({ dueAt: "2026-09-02T00:00:00.000Z" });
    const plan = planLmsFeedSync({ deadlines: [old, far, knownOld], records: [record()], courses, now });
    expect(plan.create).toEqual([]);
    expect(plan.addNeedsCourse).toEqual([]);
    expect(plan.updateItems).toHaveLength(1);
    expect(plan.counts.deadlines).toBe(3);
  });

  it("uses the last copy of a duplicated UID", () => {
    const plan = planLmsFeedSync({
      deadlines: [deadline({ title: "First" }), deadline({ title: "Second" })],
      records: [],
      courses,
      now,
    });
    expect(plan.create.map((entry) => entry.deadline.title)).toEqual(["Second"]);
  });
});
