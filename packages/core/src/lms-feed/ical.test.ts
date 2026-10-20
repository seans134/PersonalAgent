import { describe, expect, it } from "vitest";
import { BRIGHTSPACE_FEED, CANVAS_FEED, MOODLE_FEED } from "./fixtures";
import { parseICalDate, parseICalendar, unescapeICalText, unfoldICalLines } from "./ical";

describe("unfoldICalLines", () => {
  it("joins CRLF/LF continuation lines that start with a space or tab", () => {
    expect(unfoldICalLines("SUMMARY:Long\r\n  title\r\n\t here\nUID:1")).toEqual(["SUMMARY:Long title here", "UID:1"]);
  });

  it("strips a byte-order mark", () => {
    expect(unfoldICalLines("﻿BEGIN:VCALENDAR")[0]).toBe("BEGIN:VCALENDAR");
  });
});

describe("unescapeICalText", () => {
  it("unescapes commas, semicolons, backslashes and newlines", () => {
    expect(unescapeICalText("a\\, b\\; c\\\\d\\ne\\Nf")).toBe("a, b; c\\d\ne\nf");
  });
});

describe("parseICalDate", () => {
  it("reads all-day dates", () => {
    expect(parseICalDate("20261104", { VALUE: "DATE" })).toEqual({ kind: "date", date: "2026-11-04" });
    expect(parseICalDate("20261104")).toEqual({ kind: "date", date: "2026-11-04" });
  });

  it("reads UTC date-times", () => {
    expect(parseICalDate("20261023T035900Z")).toEqual({ kind: "utc", iso: "2026-10-23T03:59:00.000Z" });
  });

  it("reads local date-times with and without TZID", () => {
    expect(parseICalDate("20261102T235900", { TZID: "America/New_York" })).toEqual({
      kind: "local",
      date: "2026-11-02",
      time: "23:59:00",
      tzid: "America/New_York",
    });
    expect(parseICalDate("20261102T080000")).toMatchObject({ kind: "local", tzid: null });
  });

  it("rejects malformed and impossible values", () => {
    expect(parseICalDate("2026-11-04")).toBeNull();
    expect(parseICalDate("20260231")).toBeNull();
    expect(parseICalDate("20261104T250000Z")).toBeNull();
    expect(parseICalDate("20261104T100000", { VALUE: "DATE" })).toBeNull();
  });
});

describe("parseICalendar", () => {
  it("reads a Canvas feed: UIDs, tags, folded and escaped summaries, all-day dates; ignores VALARM", () => {
    const result = parseICalendar(CANVAS_FEED);
    expect(result.isCalendar).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.events).toHaveLength(5);

    const [problemSet, midterm, officeHours, essay] = result.events;
    expect(problemSet).toMatchObject({
      component: "VEVENT",
      uid: "event-assignment-501234",
      summary: "Problem Set 4 [CS 101-001 Intro to Programming]",
      start: { kind: "utc", iso: "2026-10-23T03:59:00.000Z" },
      url: "https://canvas.example.edu/courses/4321/assignments/501234",
      recurring: false,
    });
    expect(midterm).toMatchObject({
      summary: "Midterm Exam [CHEM 201]",
      location: "Science Hall 100",
      start: { kind: "date", date: "2026-11-04" },
      end: { kind: "date", date: "2026-11-05" },
    });
    expect(officeHours.summary).toBe("Office Hours [CHEM 201]");
    expect(essay.summary).toBe("Essay, draft 2: Compare and contrast the two readings from week six [ENGL 110]");
  });

  it("reads Moodle CATEGORIES and LF line endings", () => {
    const result = parseICalendar(MOODLE_FEED);
    expect(result.events.map((event) => event.uid)).toEqual(["3141@moodle.example.edu", "3142@moodle.example.edu"]);
    expect(result.events[0].categories).toEqual(["PHYS 120"]);
  });

  it("reads quoted TZID params and flags recurring events", () => {
    const result = parseICalendar(BRIGHTSPACE_FEED);
    expect(result.events[0].start).toEqual({ kind: "local", date: "2026-11-02", time: "23:59:00", tzid: "America/New_York" });
    expect(result.events[2].recurring).toBe(true);
  });

  it("splits CATEGORIES on unescaped commas, reads VTODO DUE, STATUS and RECURRENCE-ID", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "X-WR-TIMEZONE:America/Chicago",
      "BEGIN:VTODO",
      "UID:todo-1",
      "SUMMARY:Reading response",
      "DUE:20261101T120000",
      "CATEGORIES:ECON 101,Section A\\, Fall",
      "END:VTODO",
      "BEGIN:VEVENT",
      "UID:ev-2",
      "SUMMARY:Exam",
      "STATUS:cancelled",
      "RECURRENCE-ID:20261101T120000Z",
      "DTSTART:20261101T120000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const result = parseICalendar(text);
    expect(result.calendarTimezone).toBe("America/Chicago");
    expect(result.events[0]).toMatchObject({
      component: "VTODO",
      due: { kind: "local", date: "2026-11-01", time: "12:00:00", tzid: null },
      categories: ["ECON 101", "Section A, Fall"],
    });
    expect(result.events[1]).toMatchObject({ status: "CANCELLED", recurrenceOverride: true });
  });

  it("skips components without a UID", () => {
    const text = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:No id\nDTSTART:20261101T120000Z\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseICalendar(text).events).toEqual([]);
  });

  it("stops at maxEvents and reports truncation", () => {
    const events = Array.from({ length: 5 }, (_, i) => `BEGIN:VEVENT\nUID:${i}\nSUMMARY:HW ${i}\nEND:VEVENT`).join("\n");
    const result = parseICalendar(`BEGIN:VCALENDAR\n${events}\nEND:VCALENDAR`, { maxEvents: 3 });
    expect(result.events).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it("flags text that isn't a calendar", () => {
    expect(parseICalendar("<html><body>Login</body></html>").isCalendar).toBe(false);
  });

  it("keeps colons inside quoted params out of the value split", () => {
    const text = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY;ALTREP="http://a.b/c":Paper 1\nEND:VEVENT\nEND:VCALENDAR';
    expect(parseICalendar(text).events[0].summary).toBe("Paper 1");
  });
});
