export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleBlockCategory = "school" | "work" | "study" | "personal" | "unavailable";

export type ScheduleBlock = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  timezone?: string;
};

export type CalendarEventSource = "manual" | "recurring_schedule" | "google";

export type CalendarEvent = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  date: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
  sourceId?: string;
};

export type CalendarConflict = {
  firstEvent: CalendarEvent;
  secondEvent: CalendarEvent;
  startTime: string;
  endTime: string;
};

export type FreeWindow = {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

type CalendarSnapshot = {
  scheduleBlocks?: ScheduleBlock[];
  events?: CalendarEvent[];
};

type MinuteRange = {
  start: number;
  end: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertClockTime(value: string, fieldName: string) {
  if (!TIME_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a valid HH:MM time.`);
  }
}

function assertDate(value: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error("date must be a valid YYYY-MM-DD date.");
  }
}

function toMinutes(value: string): number {
  assertClockTime(value, "time");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTimeString(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(totalMinutes)));
  const hours = Math.floor(safeMinutes / 60).toString().padStart(2, "0");
  const minutes = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toDateKey(value: Date | string): string {
  if (typeof value === "string") {
    assertDate(value);
    return value;
  }

  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayOfWeekFromDateKey(dateKey: string): DayOfWeek {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay() as DayOfWeek;
}

function validateTimeRange(startTime: string, endTime: string) {
  assertClockTime(startTime, "startTime");
  assertClockTime(endTime, "endTime");

  if (toMinutes(endTime) <= toMinutes(startTime)) {
    throw new Error("endTime must be after startTime.");
  }
}

function validateScheduleBlock(block: ScheduleBlock) {
  if (!block.id.trim()) {
    throw new Error("schedule block id is required.");
  }

  if (!block.title.trim()) {
    throw new Error("schedule block title is required.");
  }

  if (block.daysOfWeek.length === 0) {
    throw new Error("schedule block must include at least one day.");
  }

  validateTimeRange(block.startTime, block.endTime);
}

function validateCalendarEvent(event: CalendarEvent) {
  if (!event.id.trim()) {
    throw new Error("calendar event id is required.");
  }

  if (!event.title.trim()) {
    throw new Error("calendar event title is required.");
  }

  assertDate(event.date);
  validateTimeRange(event.startTime, event.endTime);
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }

    if (a.startTime !== b.startTime) {
      return a.startTime < b.startTime ? -1 : 1;
    }

    return a.endTime < b.endTime ? -1 : 1;
  });
}

function rangesOverlap(first: MinuteRange, second: MinuteRange): boolean {
  return first.start < second.end && second.start < first.end;
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MinuteRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

export class Calendar {
  private readonly scheduleBlocks: ScheduleBlock[];
  private readonly events: CalendarEvent[];

  constructor(snapshot: CalendarSnapshot = {}) {
    this.scheduleBlocks = [];
    this.events = [];

    for (const block of snapshot.scheduleBlocks ?? []) {
      this.addScheduleBlock(block);
    }

    for (const event of snapshot.events ?? []) {
      this.addEvent(event);
    }
  }

  addScheduleBlock(block: ScheduleBlock) {
    validateScheduleBlock(block);
    this.scheduleBlocks.push({ ...block, daysOfWeek: [...block.daysOfWeek] });
  }

  addEvent(event: CalendarEvent) {
    validateCalendarEvent(event);
    this.events.push({ ...event });
  }

  getScheduleBlocks(): ScheduleBlock[] {
    return this.scheduleBlocks.map((block) => ({ ...block, daysOfWeek: [...block.daysOfWeek] }));
  }

  getEvents(): CalendarEvent[] {
    return sortEvents(this.events).map((event) => ({ ...event }));
  }

  getEventsForDate(date: Date | string): CalendarEvent[] {
    const dateKey = toDateKey(date);
    const dayOfWeek = dayOfWeekFromDateKey(dateKey);

    const recurringEvents = this.scheduleBlocks
      .filter((block) => block.daysOfWeek.includes(dayOfWeek))
      .map((block): CalendarEvent => ({
        id: `${block.id}:${dateKey}`,
        title: block.title,
        category: block.category,
        date: dateKey,
        startTime: block.startTime,
        endTime: block.endTime,
        source: "recurring_schedule",
        sourceId: block.id,
      }));

    const datedEvents = this.events.filter((event) => event.date === dateKey);

    return sortEvents([...recurringEvents, ...datedEvents]);
  }

  findConflicts(date: Date | string): CalendarConflict[] {
    const events = this.getEventsForDate(date);
    const conflicts: CalendarConflict[] = [];

    for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
        const firstEvent = events[firstIndex];
        const secondEvent = events[secondIndex];
        const firstRange = { start: toMinutes(firstEvent.startTime), end: toMinutes(firstEvent.endTime) };
        const secondRange = { start: toMinutes(secondEvent.startTime), end: toMinutes(secondEvent.endTime) };

        if (!rangesOverlap(firstRange, secondRange)) {
          continue;
        }

        conflicts.push({
          firstEvent,
          secondEvent,
          startTime: toTimeString(Math.max(firstRange.start, secondRange.start)),
          endTime: toTimeString(Math.min(firstRange.end, secondRange.end)),
        });
      }
    }

    return conflicts;
  }

  getFreeWindows(date: Date | string, dayStartTime = "07:00", dayEndTime = "22:00"): FreeWindow[] {
    validateTimeRange(dayStartTime, dayEndTime);

    const dateKey = toDateKey(date);
    const dayStart = toMinutes(dayStartTime);
    const dayEnd = toMinutes(dayEndTime);
    const busyRanges = mergeRanges(
      this.getEventsForDate(dateKey).map((event) => ({
        start: Math.max(dayStart, toMinutes(event.startTime)),
        end: Math.min(dayEnd, toMinutes(event.endTime)),
      })),
    ).filter((range) => range.end > range.start);

    const freeWindows: FreeWindow[] = [];
    let cursor = dayStart;

    for (const busyRange of busyRanges) {
      if (busyRange.start > cursor) {
        freeWindows.push({
          date: dateKey,
          startTime: toTimeString(cursor),
          endTime: toTimeString(busyRange.start),
          durationMinutes: busyRange.start - cursor,
        });
      }

      cursor = Math.max(cursor, busyRange.end);
    }

    if (cursor < dayEnd) {
      freeWindows.push({
        date: dateKey,
        startTime: toTimeString(cursor),
        endTime: toTimeString(dayEnd),
        durationMinutes: dayEnd - cursor,
      });
    }

    return freeWindows;
  }

  toJSON(): Required<CalendarSnapshot> {
    return {
      scheduleBlocks: this.getScheduleBlocks(),
      events: this.getEvents(),
    };
  }
}
