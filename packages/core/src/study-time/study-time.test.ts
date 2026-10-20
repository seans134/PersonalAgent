import { describe, expect, it } from "vitest";
import { formatStudyMinutes } from "../grades/study";
import {
  formatStudyTimer,
  isStudySessionOverdue,
  parseStudyMinutesInput,
  parseStudySessionManualRequest,
  parseStudySessionStartRequest,
  STUDY_SESSION_AUTO_STOP_MINUTES,
  studyMinutesBucket,
  studySessionMinutes,
  studySessionStop,
  studyTimerElapsedMs,
} from "./sessions";
import {
  buildStudySummary,
  studyDayLabel,
  studyMinutesByCourse,
  studyMinutesForDays,
  studyStreakDays,
  studyWeekStart,
  totalStudyMinutes,
  type StudySessionLike,
} from "./summary";

const COURSE_A = "11111111-1111-4111-8111-111111111111";
const COURSE_B = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function session(studyDate: string, durationMinutes: number | null, courseId: string | null = COURSE_A, courseName: string | null = "Biology"): StudySessionLike {
  return { courseId, courseName, studyDate, durationMinutes };
}

describe("studySessionMinutes", () => {
  it("floors whole minutes and never goes negative", () => {
    expect(studySessionMinutes("2026-10-20T10:00:00.000Z", "2026-10-20T10:44:59.000Z")).toBe(44);
    expect(studySessionMinutes("2026-10-20T10:00:00.000Z", "2026-10-20T10:00:59.000Z")).toBe(0);
    expect(studySessionMinutes("2026-10-20T10:00:00.000Z", "2026-10-20T09:00:00.000Z")).toBe(0);
    expect(studySessionMinutes("nope", "2026-10-20T09:00:00.000Z")).toBe(0);
  });
});

describe("studySessionStop", () => {
  const start = "2026-10-20T10:00:00.000Z";

  it("ends at now for a normal session", () => {
    const now = new Date("2026-10-20T11:30:20.000Z");
    expect(studySessionStop(start, now)).toEqual({ endedAt: now.toISOString(), minutes: 90, autoStopped: false });
  });

  it("caps a timer left running past the limit and marks it", () => {
    const now = new Date("2026-10-21T08:00:00.000Z");
    expect(isStudySessionOverdue(start, now)).toBe(true);
    expect(studySessionStop(start, now)).toEqual({
      endedAt: "2026-10-20T16:00:00.000Z",
      minutes: STUDY_SESSION_AUTO_STOP_MINUTES,
      autoStopped: true,
    });
  });

  it("keeps exactly six hours as a normal stop", () => {
    const now = new Date("2026-10-20T16:00:00.000Z");
    expect(isStudySessionOverdue(start, now)).toBe(false);
    expect(studySessionStop(start, now).autoStopped).toBe(false);
  });

  it("reports under a minute so the caller can discard it", () => {
    expect(studySessionStop(start, new Date("2026-10-20T10:00:40.000Z")).minutes).toBe(0);
  });
});

describe("timer display", () => {
  it("formats the running clock", () => {
    expect(formatStudyTimer(0)).toBe("0:00");
    expect(formatStudyTimer(245_000)).toBe("4:05");
    expect(formatStudyTimer(3_729_000)).toBe("1:02:09");
    expect(formatStudyTimer(-5)).toBe("0:00");
  });

  it("never shows negative elapsed time for a fast device clock", () => {
    expect(studyTimerElapsedMs("2026-10-20T10:00:00.000Z", Date.parse("2026-10-20T09:59:00.000Z"))).toBe(0);
    expect(studyTimerElapsedMs("2026-10-20T10:00:00.000Z", Date.parse("2026-10-20T10:01:00.000Z"))).toBe(60_000);
  });

  it("formats study durations for copy", () => {
    expect(formatStudyMinutes(45)).toBe("45 min");
    expect(formatStudyMinutes(120)).toBe("2 h");
    expect(formatStudyMinutes(260)).toBe("4 h 20 min");
    expect(formatStudyMinutes(0)).toBe("0 min");
  });
});

describe("studyMinutesBucket", () => {
  it("buckets session length for analytics", () => {
    expect(studyMinutesBucket(1)).toBe("<15");
    expect(studyMinutesBucket(14)).toBe("<15");
    expect(studyMinutesBucket(15)).toBe("15-30");
    expect(studyMinutesBucket(30)).toBe("30-60");
    expect(studyMinutesBucket(59)).toBe("30-60");
    expect(studyMinutesBucket(60)).toBe("60+");
    expect(studyMinutesBucket(360)).toBe("60+");
  });
});

describe("parseStudySessionStartRequest", () => {
  it("accepts a standalone timer with or without a course", () => {
    expect(parseStudySessionStartRequest({})).toEqual({
      ok: true,
      value: { courseId: null, courseItemId: null, planItemKey: null, planDate: null },
    });
    expect(parseStudySessionStartRequest(undefined).ok).toBe(true);
    expect(parseStudySessionStartRequest({ courseId: COURSE_A })).toMatchObject({ ok: true, value: { courseId: COURSE_A } });
  });

  it("takes the course item from a study block's key", () => {
    const result = parseStudySessionStartRequest({ planItemKey: `study:${ITEM}#2`, planDate: "2026-10-20" });
    expect(result).toEqual({
      ok: true,
      value: { courseId: null, courseItemId: ITEM, planItemKey: `study:${ITEM}#2`, planDate: "2026-10-20" },
    });
  });

  it("rejects bad ids, non-study blocks and half a plan reference", () => {
    expect(parseStudySessionStartRequest({ courseId: "abc" }).ok).toBe(false);
    expect(parseStudySessionStartRequest({ planItemKey: "goal:read", planDate: "2026-10-20" }).ok).toBe(false);
    expect(parseStudySessionStartRequest({ planItemKey: `study:${ITEM}` }).ok).toBe(false);
    expect(parseStudySessionStartRequest({ planItemKey: `study:${ITEM}`, planDate: "2026-13-01" }).ok).toBe(false);
    expect(
      parseStudySessionStartRequest({ courseItemId: COURSE_B, planItemKey: `study:${ITEM}`, planDate: "2026-10-20" }).ok,
    ).toBe(false);
    expect(parseStudySessionStartRequest([]).ok).toBe(false);
  });
});

describe("parseStudySessionManualRequest", () => {
  it("accepts a course, date and whole minutes", () => {
    expect(parseStudySessionManualRequest({ courseId: COURSE_A, date: "2026-10-19", minutes: 45 })).toEqual({
      ok: true,
      value: { courseId: COURSE_A, date: "2026-10-19", minutes: 45 },
    });
  });

  it("rejects lengths outside 1-720 minutes and bad dates", () => {
    expect(parseStudySessionManualRequest({ date: "2026-10-19", minutes: 0 }).ok).toBe(false);
    expect(parseStudySessionManualRequest({ date: "2026-10-19", minutes: 721 }).ok).toBe(false);
    expect(parseStudySessionManualRequest({ date: "2026-10-19", minutes: 12.5 }).ok).toBe(false);
    expect(parseStudySessionManualRequest({ date: "yesterday", minutes: 30 }).ok).toBe(false);
  });

  it("parses typed minutes", () => {
    expect(parseStudyMinutesInput(" 90 ")).toBe(90);
    expect(parseStudyMinutesInput("0")).toBeNull();
    expect(parseStudyMinutesInput("1.5")).toBeNull();
    expect(parseStudyMinutesInput("800")).toBeNull();
  });
});

describe("study insights", () => {
  // 2026-10-21 is a Wednesday; the week starts Monday 2026-10-19.
  const today = "2026-10-21";

  it("finds the Monday of the week", () => {
    expect(studyWeekStart("2026-10-21")).toBe("2026-10-19");
    expect(studyWeekStart("2026-10-19")).toBe("2026-10-19");
    expect(studyWeekStart("2026-10-25")).toBe("2026-10-19");
    expect(studyDayLabel("2026-10-25")).toBe("Sun");
  });

  it("totals minutes per course this week, most first", () => {
    const sessions = [
      session("2026-10-18", 300), // last week (Sunday)
      session("2026-10-19", 30),
      session("2026-10-21", 45),
      session("2026-10-20", 90, COURSE_B, "Chemistry"),
      session("2026-10-21", 20, null, null),
      session("2026-10-21", null), // still running
    ];
    expect(studyMinutesByCourse(sessions, studyWeekStart(today), today)).toEqual([
      { courseId: COURSE_B, courseName: "Chemistry", minutes: 90 },
      { courseId: COURSE_A, courseName: "Biology", minutes: 75 },
      { courseId: null, courseName: null, minutes: 20 },
    ]);
  });

  it("builds a 7-day bar ending today, with empty days as 0", () => {
    const days = studyMinutesForDays([session("2026-10-15", 30), session("2026-10-21", 10), session("2026-10-21", 5)], today);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-15", minutes: 30 });
    expect(days[6]).toEqual({ date: "2026-10-21", minutes: 15 });
    expect(days.slice(1, 6).every((day) => day.minutes === 0)).toBe(true);
  });

  it("counts the streak back from today, or from yesterday while today is empty", () => {
    const run = [session("2026-10-19", 10), session("2026-10-20", 10)];
    expect(studyStreakDays([...run, session("2026-10-21", 5)], today)).toBe(3);
    expect(studyStreakDays(run, today)).toBe(2);
    expect(studyStreakDays([session("2026-10-19", 10)], today)).toBe(0);
    expect(studyStreakDays([], today)).toBe(0);
    expect(studyStreakDays([session("2026-10-21", 10), session("2026-10-20", 10)], today, 1)).toBe(1);
  });

  it("builds the summary", () => {
    const summary = buildStudySummary([session("2026-10-20", 60), session("2026-10-21", 25)], { today, courseTotalMinutes: 260 });
    expect(summary).toMatchObject({
      today,
      weekStart: "2026-10-19",
      weekTotalMinutes: 85,
      streakDays: 2,
      todayMinutes: 25,
      running: null,
      autoStopped: null,
      courseTotalMinutes: 260,
    });
    expect(buildStudySummary([], { today })).not.toHaveProperty("courseTotalMinutes");
    expect(totalStudyMinutes([session("2026-01-01", 200), session("2026-02-01", 60), session("2026-02-02", null)])).toBe(260);
  });
});
