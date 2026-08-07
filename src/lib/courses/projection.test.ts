import { describe, expect, it } from "vitest";
import {
  courseItemsToStudyItems,
  courseItemsToTodayBusyEvents,
  projectCourseItemsToEvents,
} from "./projection";
import type { CourseItemRow } from "./types";

const tz = "America/Toronto";
const row = (over: Partial<CourseItemRow>): CourseItemRow => ({
  id: "i1", course_id: "c1", category_id: "cat", user_id: "u", kind: "exam", title: "Midterm",
  due_at: "2026-08-07T18:00:00Z", end_at: null, location: "Room 5", score_earned: null, score_max: 100,
  estimated_effort_hours: 4, focus_mode: "finish_first", created_at: "", ...over,
});

describe("projection", () => {
  it("projects an exam as a timed event with default 120-min duration", () => {
    const [event] = projectCourseItemsToEvents([row({})], tz);
    expect(event.isDeadline).toBe(false);
    // 18:00Z = 14:00 EDT, +120min = 16:00
    expect(event.startTime).toBe("14:00");
    expect(event.endTime).toBe("16:00");
  });

  it("projects an assignment as a zero-duration deadline marker", () => {
    const [event] = projectCourseItemsToEvents([row({ kind: "assignment", due_at: "2026-08-07T20:00:00Z" })], tz);
    expect(event.isDeadline).toBe(true);
    expect(event.startTime).toBe(event.endTime);
  });

  it("returns today's exam as a busy calendar event", () => {
    const events = courseItemsToTodayBusyEvents([row({})], tz, "2026-08-07");
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("school");
  });

  it("excludes assignments from today busy events", () => {
    const events = courseItemsToTodayBusyEvents([row({ kind: "assignment" })], tz, "2026-08-07");
    expect(events).toHaveLength(0);
  });

  it("maps to study items with local due date", () => {
    const names = new Map([["c1", "Chemistry"]]);
    const [study] = courseItemsToStudyItems([row({})], names, tz);
    expect(study.courseName).toBe("Chemistry");
    expect(study.dueLocalDate).toBe("2026-08-07");
    expect(study.focusMode).toBe("finish_first");
  });

  it("projects a quiz with default 60-min duration", () => {
    const [event] = projectCourseItemsToEvents([row({ kind: "quiz", due_at: "2026-08-07T18:00:00Z" })], tz);
    expect(event.isDeadline).toBe(false);
    // 18:00Z = 14:00 EDT, +60min = 15:00
    expect(event.startTime).toBe("14:00");
    expect(event.endTime).toBe("15:00");
  });

  it("clamps end time to 23:59 when default duration crosses midnight", () => {
    const [event] = projectCourseItemsToEvents([row({ kind: "quiz", due_at: "2026-08-07T03:00:00Z" })], tz);
    // 03:00Z = 23:00 EDT (previous day), but localDate is 2026-08-06
    // +60min would be 00:00, clamped to 23:59
    expect(event.startTime).toBe("23:00");
    expect(event.endTime).toBe("23:59");
  });

  it("uses explicit end_at time when on the same local day", () => {
    const [event] = projectCourseItemsToEvents(
      [row({ kind: "exam", due_at: "2026-08-07T18:00:00Z", end_at: "2026-08-07T20:00:00Z" })],
      tz
    );
    expect(event.startTime).toBe("14:00");
    expect(event.endTime).toBe("16:00");
  });

  it("clamps to 23:59 when explicit end_at crosses to next local day", () => {
    const [event] = projectCourseItemsToEvents(
      [row({ kind: "exam", due_at: "2026-08-07T20:00:00Z", end_at: "2026-08-08T04:00:00Z" })],
      tz
    );
    // 20:00Z = 16:00 EDT on 2026-08-07; 04:00Z = 00:00 EDT on 2026-08-08 (next day)
    expect(event.startTime).toBe("16:00");
    expect(event.endTime).toBe("23:59");
  });

  it("excludes events not on the specified today date", () => {
    const events = courseItemsToTodayBusyEvents([row({ due_at: "2026-08-08T18:00:00Z" })], tz, "2026-08-07");
    expect(events).toHaveLength(0);
  });
});
