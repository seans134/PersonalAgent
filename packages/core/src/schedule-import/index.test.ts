import { describe, expect, it } from "vitest";
import { Calendar, dateInTimezone } from "../calendar";
import { emptyScheduleEntry, scheduleEntryErrors, schedulePreview, scheduleReviewIssues, validateScheduleImport, type ScheduleImportEntry } from ".";
const entry = (patch: Partial<ScheduleImportEntry> = {}): ScheduleImportEntry => ({ ...emptyScheduleEntry("America/Toronto"), kind: "recurring", title: "Class", daysOfWeek: [1], startTime: "09:00", endTime: "10:00", effectiveFrom: "2026-10-01", effectiveUntil: "2026-12-15", include: true, ...patch });
describe("schedule import", () => {
  it("supports a mixed timetable and dated roster", () => {
    const draft = validateScheduleImport({ entries: [entry(), entry({ kind: "dated", date: "2026-10-19", category: "work" })] }, true);
    expect(draft.entries).toHaveLength(2); expect(schedulePreview(draft, "2026-10-19")[0].events).toHaveLength(2);
  });
  it("excludes uncertain times and missing date ranges until explicitly corrected", () => {
    const draft = validateScheduleImport({ entries: [entry({ startTime: "", effectiveUntil: null })] });
    expect(draft.entries[0].include).toBe(false); expect(draft.entries[0].warnings.length).toBeGreaterThan(0);
    expect(scheduleEntryErrors(entry({ ongoing: true, effectiveFrom: null, effectiveUntil: null }))).toEqual([]);
    expect(() => validateScheduleImport({ entries: [entry({ effectiveUntil: null })] }, true)).toThrow(/Confirm/);
  });
  it("rejects invalid dates, timezones, backwards bounds, and shifts longer than a day", () => {
    expect(scheduleEntryErrors(entry({ effectiveUntil: "2026-02-30" })).length).toBeGreaterThan(0);
    expect(scheduleEntryErrors(entry({ timezone: "invalid" })).length).toBeGreaterThan(0);
    expect(scheduleEntryErrors(entry({ effectiveUntil: "2026-01-01" })).length).toBeGreaterThan(0);
    expect(scheduleEntryErrors(entry({ endDayOffset: 1 })).length).toBeGreaterThan(0);
  });
  it("skips exact duplicates and flags overlaps, including between draft rows", () => {
    const e = entry(); const existing = { scheduleBlocks: [{ ...e, id: "existing" }], events: [] };
    expect(scheduleReviewIssues({ entries: [e], warnings: [] }, existing)[0]).toEqual({ duplicate: true, overlap: false });
    expect(scheduleReviewIssues({ entries: [entry({ title: "Work" })], warnings: [] }, existing)[0].overlap).toBe(true);
    expect(scheduleReviewIssues({ entries: [e, e], warnings: [] }, { scheduleBlocks: [], events: [] })[1].duplicate).toBe(true);
    expect(scheduleReviewIssues({ entries: [entry({ effectiveFrom: "2027-01-01", effectiveUntil: "2027-02-01" })], warnings: [] }, existing)[0].overlap).toBe(false);
  });
});
describe("bounded and overnight calendar occurrences", () => {
  it("clips a dated overnight shift across a month boundary and preserves editing identity", () => {
    const calendar = new Calendar({ events: [{ id: "shift", title: "Night shift", category: "work", date: "2026-10-31", startTime: "22:00", endTime: "06:00", endDayOffset: 1, source: "manual" }] });
    expect(calendar.getEventsForDate("2026-10-31")[0].endTime).toBe("24:00");
    expect(calendar.getEventsForDate("2026-11-01")[0]).toMatchObject({ sourceId: "shift", originalDate: "2026-10-31", originalStartTime: "22:00", originalEndTime: "06:00", startTime: "00:00", endTime: "06:00" });
    expect(calendar.getFreeWindows("2026-11-01", "00:00", "08:00")).toEqual([{ date: "2026-11-01", startTime: "06:00", endTime: "08:00", durationMinutes: 120 }]);
  });
  it("includes the tail of the last bounded weekly shift but no following weeks", () => {
    const calendar = new Calendar({ scheduleBlocks: [{ id: "night", title: "Night shift", category: "work", daysOfWeek: [6], startTime: "22:00", endTime: "06:00", endDayOffset: 1, effectiveFrom: "2026-10-31", effectiveUntil: "2026-10-31" }] });
    expect(calendar.getEventsForDate("2026-10-24")).toHaveLength(0);
    expect(calendar.getEventsForDate("2026-11-01")).toHaveLength(1);
    expect(calendar.getEventsForDate("2026-11-07")).toHaveLength(0);
  });
  it("keeps weekly wall times across DST and derives today from the profile timezone", () => {
    const calendar = new Calendar({ scheduleBlocks: [{ id: "weekly", title: "Work", category: "work", daysOfWeek: [0], startTime: "09:00", endTime: "10:00", timezone: "America/Toronto" }] });
    expect(calendar.getEventsForDate("2026-11-01")[0].startTime).toBe("09:00");
    expect(calendar.getEventsForDate("2026-11-08")[0].startTime).toBe("09:00");
    expect(dateInTimezone(new Date("2026-10-20T01:00:00Z"), "America/Toronto")).toBe("2026-10-19");
  });
});
