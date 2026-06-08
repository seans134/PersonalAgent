import { describe, expect, it } from "vitest";
import { Calendar, type CalendarEvent, type ScheduleBlock } from ".";

const schoolBlock: ScheduleBlock = {
  id: "class-calc",
  title: "Calculus",
  category: "school",
  daysOfWeek: [1, 3],
  startTime: "09:00",
  endTime: "10:15",
};

const workBlock: ScheduleBlock = {
  id: "work-evening",
  title: "Work shift",
  category: "work",
  daysOfWeek: [1],
  startTime: "16:00",
  endTime: "20:00",
};

const appointment: CalendarEvent = {
  id: "advisor",
  title: "Advisor meeting",
  category: "school",
  date: "2026-05-18",
  startTime: "10:30",
  endTime: "11:00",
  source: "manual",
};

describe("Calendar", () => {
  it("expands recurring school and work blocks for a date", () => {
    const calendar = new Calendar({
      scheduleBlocks: [schoolBlock, workBlock],
      events: [appointment],
    });

    const mondayEvents = calendar.getEventsForDate("2026-05-18");

    expect(mondayEvents.map((event) => event.title)).toEqual(["Calculus", "Advisor meeting", "Work shift"]);
    expect(mondayEvents[0]).toMatchObject({
      id: "class-calc:2026-05-18",
      source: "recurring_schedule",
      sourceId: "class-calc",
    });
  });

  it("finds overlapping events on the same date", () => {
    const calendar = new Calendar({
      scheduleBlocks: [schoolBlock],
      events: [
        {
          id: "quiz",
          title: "Quiz review",
          category: "study",
          date: "2026-05-18",
          startTime: "09:45",
          endTime: "10:30",
          source: "manual",
        },
      ],
    });

    const conflicts = calendar.findConflicts("2026-05-18");

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      startTime: "09:45",
      endTime: "10:15",
    });
  });

  it("returns free windows around busy blocks", () => {
    const calendar = new Calendar({
      scheduleBlocks: [schoolBlock, workBlock],
      events: [appointment],
    });

    const freeWindows = calendar.getFreeWindows("2026-05-18", "08:00", "21:00");

    expect(freeWindows).toEqual([
      { date: "2026-05-18", startTime: "08:00", endTime: "09:00", durationMinutes: 60 },
      { date: "2026-05-18", startTime: "10:15", endTime: "10:30", durationMinutes: 15 },
      { date: "2026-05-18", startTime: "11:00", endTime: "16:00", durationMinutes: 300 },
      { date: "2026-05-18", startTime: "20:00", endTime: "21:00", durationMinutes: 60 },
    ]);
  });

  it("rejects invalid time ranges", () => {
    expect(
      () =>
        new Calendar({
          scheduleBlocks: [
            {
              ...schoolBlock,
              startTime: "12:00",
              endTime: "11:00",
            },
          ],
        }),
    ).toThrow(/endTime must be after startTime/);
  });

  it("rejects invalid calendar dates", () => {
    expect(
      () =>
        new Calendar({
          events: [
            {
              ...appointment,
              date: "2026-02-31",
            },
          ],
        }),
    ).toThrow(/date must be a valid YYYY-MM-DD date/);
  });

  it("rejects invalid schedule weekdays", () => {
    expect(
      () =>
        new Calendar({
          scheduleBlocks: [
            {
              ...schoolBlock,
              daysOfWeek: [7 as never],
            },
          ],
        }),
    ).toThrow(/daysOfWeek must contain values from 0 to 6/);
  });

  it("updates and removes dated events", () => {
    const calendar = new Calendar({ events: [appointment] });

    const updated = calendar.updateEvent("advisor", {
      title: "Advisor sync",
      startTime: "11:15",
      endTime: "11:45",
    });

    expect(updated).toMatchObject({
      id: "advisor",
      title: "Advisor sync",
      startTime: "11:15",
      endTime: "11:45",
    });
    expect(calendar.getEvent("advisor")).toMatchObject(updated);
    expect(calendar.getEventsForDate("2026-05-18").map((event) => event.title)).toEqual(["Advisor sync"]);

    expect(calendar.removeEvent("advisor")).toBe(true);
    expect(calendar.getEvent("advisor")).toBeNull();
    expect(calendar.getEventsForDate("2026-05-18")).toEqual([]);
  });

  it("rejects duplicate stored event ids", () => {
    expect(
      () =>
        new Calendar({
          events: [appointment, { ...appointment, title: "Duplicate advisor" }],
        }),
    ).toThrow(/calendar event already exists/);
  });

  it("serializes without exposing internal mutable arrays", () => {
    const calendar = new Calendar({ scheduleBlocks: [schoolBlock], events: [appointment] });
    const snapshot = calendar.toJSON();

    snapshot.scheduleBlocks[0]?.daysOfWeek.push(5);

    expect(calendar.getScheduleBlocks()[0]?.daysOfWeek).toEqual([1, 3]);
  });
});
