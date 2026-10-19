import { describe, expect, it } from "vitest";
import {
  buildExamReminders,
  calendarDaysUntil,
  examLabel,
  examsWithinDays,
  formatDaysAway,
  nextUpcomingExam,
} from "./exams";

// 8:00 PM Saturday Oct 10 in Toronto (EDT, UTC-4); already Sunday Oct 11 in UTC and Tokyo.
const now = new Date("2026-10-11T00:00:00Z");
const TORONTO = "America/Toronto";

function exam(id: string, dueAt: string, scoreEarned: number | null = null, kind = "exam") {
  return { id, title: id, kind, dueAt, scoreEarned };
}

describe("nextUpcomingExam", () => {
  it("picks the soonest ungraded exam due after now", () => {
    const items = [
      exam("final", "2026-12-10T14:00:00Z"),
      exam("midterm", "2026-10-20T14:00:00Z"),
      exam("ps", "2026-10-12T14:00:00Z", null, "assignment"),
    ];
    expect(nextUpcomingExam(items, now)).toEqual({ id: "midterm", title: "midterm", dueAt: "2026-10-20T14:00:00Z" });
  });

  it("skips past exams, including one due exactly now", () => {
    const items = [exam("past", "2026-10-01T14:00:00Z"), exam("now", "2026-10-11T00:00:00Z"), exam("later", "2026-11-01T14:00:00Z")];
    expect(nextUpcomingExam(items, now)?.id).toBe("later");
  });

  it("skips graded exams, even a zero", () => {
    const items = [exam("graded", "2026-10-15T14:00:00Z", 0), exam("open", "2026-10-30T14:00:00Z")];
    expect(nextUpcomingExam(items, now)?.id).toBe("open");
  });

  it("breaks ties on due time by title, then id, regardless of order", () => {
    const a = { id: "b-id", title: "Alpha", kind: "exam", dueAt: "2026-10-20T14:00:00Z", scoreEarned: null };
    const b = { id: "a-id", title: "Beta", kind: "exam", dueAt: "2026-10-20T14:00:00Z", scoreEarned: null };
    expect(nextUpcomingExam([b, a], now)?.id).toBe("b-id");
    expect(nextUpcomingExam([a, b], now)?.id).toBe("b-id");
    const c = { ...a, id: "a-id" };
    expect(nextUpcomingExam([a, c], now)?.id).toBe("a-id");
  });

  it("returns null when there are no upcoming exams", () => {
    expect(nextUpcomingExam([], now)).toBeNull();
    expect(nextUpcomingExam([exam("quiz", "2026-10-20T14:00:00Z", null, "quiz"), exam("bad", "not a date")], now)).toBeNull();
  });
});

describe("calendarDaysUntil", () => {
  it("counts calendar days in the given zone, not UTC", () => {
    // Monday Oct 12 10:00 AM Toronto: 2 days away from Saturday evening in Toronto, 1 day in UTC.
    expect(calendarDaysUntil("2026-10-12T14:00:00Z", now, TORONTO)).toBe(2);
    expect(calendarDaysUntil("2026-10-12T14:00:00Z", now, "UTC")).toBe(1);
    // Later tonight in Toronto is still today.
    expect(calendarDaysUntil("2026-10-11T03:00:00Z", now, TORONTO)).toBe(0);
  });

  it("formats the day count", () => {
    expect(formatDaysAway(0)).toBe("today");
    expect(formatDaysAway(1)).toBe("tomorrow");
    expect(formatDaysAway(5)).toBe("in 5 days");
  });
});

describe("examsWithinDays", () => {
  it("keeps future exams inside the window, soonest first", () => {
    const exams = [
      { id: "far", dueAt: "2026-10-26T14:00:00Z" },
      { id: "edge", dueAt: "2026-10-25T03:00:00Z" }, // Oct 24 11 PM Toronto: 14 days away
      { id: "soon", dueAt: "2026-10-13T14:00:00Z" },
      { id: "past", dueAt: "2026-10-10T14:00:00Z" },
    ];
    expect(examsWithinDays(exams, now, 14, TORONTO)).toEqual([
      { id: "soon", dueAt: "2026-10-13T14:00:00Z", daysAway: 3 },
      { id: "edge", dueAt: "2026-10-25T03:00:00Z", daysAway: 14 },
    ]);
  });
});

describe("buildExamReminders", () => {
  const midterm = { id: "m1", courseId: "c1", label: "CHEM 201 Midterm", dueAt: "2026-10-20T14:00:00Z" };

  it("schedules 3 days and 1 day before at 9:00 local time", () => {
    expect(buildExamReminders([midterm], now, { timeZone: TORONTO })).toEqual([
      {
        examId: "m1", courseId: "c1", daysBefore: 3, fireAt: "2026-10-17T13:00:00.000Z",
        title: "Exam in 3 days: CHEM 201 Midterm", body: "Open Atlas to plan your review.",
      },
      {
        examId: "m1", courseId: "c1", daysBefore: 1, fireAt: "2026-10-19T13:00:00.000Z",
        title: "Exam tomorrow: CHEM 201 Midterm", body: "Open Atlas to plan your review.",
      },
    ]);
  });

  it("uses the exam's local date, which can differ from its UTC date", () => {
    // Nov 2 at 9:30 PM Tokyo is still Nov 2 12:30 UTC; in Tokyo, 1 day before is Nov 1 at 9:00 JST.
    const tokyo = { ...midterm, dueAt: "2026-11-02T12:30:00Z" };
    const [, dayBefore] = buildExamReminders([tokyo], now, { timeZone: "Asia/Tokyo" });
    expect(dayBefore.fireAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("follows DST: 9:00 local is a different UTC hour after the clocks change", () => {
    // Toronto falls back on Nov 1, 2026 (EDT -> EST).
    const exam = { ...midterm, dueAt: "2026-11-03T15:00:00Z" };
    const fireAts = buildExamReminders([exam], now, { timeZone: TORONTO }).map((r) => r.fireAt);
    expect(fireAts).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-02T14:00:00.000Z"]);
  });

  it("skips reminders whose time has passed and exams already over", () => {
    // Exam Tuesday Oct 13 in Toronto: the 3-day reminder (Sat Oct 10, 9:00) already passed.
    const soon = { ...midterm, dueAt: "2026-10-13T14:00:00Z" };
    const past = { ...midterm, id: "old", dueAt: "2026-10-09T14:00:00Z" };
    const reminders = buildExamReminders([soon, past], now, { timeZone: TORONTO });
    expect(reminders.map((r) => [r.examId, r.daysBefore])).toEqual([["m1", 1]]);
  });

  it("honours a custom time and returns nothing for no exams", () => {
    const [first] = buildExamReminders([midterm], now, { timeZone: TORONTO, hour: 18, minute: 30 });
    expect(first.fireAt).toBe("2026-10-17T22:30:00.000Z");
    expect(buildExamReminders([], now)).toEqual([]);
  });
});

describe("examLabel", () => {
  it("prefers the course code and falls back to the name", () => {
    expect(examLabel({ name: "Organic Chemistry", code: "CHEM 201" }, "Midterm")).toBe("CHEM 201 Midterm");
    expect(examLabel({ name: "Organic Chemistry", code: null }, "Final")).toBe("Organic Chemistry Final");
  });
});
