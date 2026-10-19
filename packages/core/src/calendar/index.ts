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
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  endDayOffset?: 0 | 1;
};

export type CalendarEventSource = "manual" | "recurring_schedule" | "course";

export type CourseItemKind = "assignment" | "quiz" | "exam";

/** Present on events projected from a course item (syllabus import or course page). */
export type CalendarCourseInfo = {
  itemId: string;
  courseId: string;
  courseName: string;
  kind: CourseItemKind;
  /** Assignments are deadlines: `dueTime` is the moment they are due, not a busy block. */
  isDeadline: boolean;
  dueTime: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  date: string;
  startTime: string;
  endTime: string;
  source: CalendarEventSource;
  sourceId?: string;
  course?: CalendarCourseInfo;
  endDayOffset?: 0 | 1;
  timezone?: string;
  /** Original item for editing a clipped overnight occurrence. */
  originalDate?: string;
  originalStartTime?: string;
  originalEndTime?: string;
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

type CalendarEventPatch = Partial<Omit<CalendarEvent, "id">>;

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

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    throw new Error("date must be a valid YYYY-MM-DD date.");
  }
}

function toMinutes(value: string): number {
  if (value === "24:00") return 1440;
  assertClockTime(value, "time");
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTimeString(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(24 * 60, Math.floor(totalMinutes)));
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

function validateTimeRange(startTime: string, endTime: string, endDayOffset: 0 | 1 = 0) {
  assertClockTime(startTime, "startTime");
  assertClockTime(endTime, "endTime");

  const duration = toMinutes(endTime) + endDayOffset * 1440 - toMinutes(startTime);
  if (duration <= 0 || duration > 1440) {
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

  for (const day of block.daysOfWeek) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("schedule block daysOfWeek must contain values from 0 to 6.");
    }
  }

  validateTimeRange(block.startTime, block.endTime, block.endDayOffset);
  if (block.effectiveFrom) assertDate(block.effectiveFrom);
  if (block.effectiveUntil) assertDate(block.effectiveUntil);
  if (block.effectiveFrom && block.effectiveUntil && block.effectiveUntil < block.effectiveFrom) throw new Error("End date must not precede start date.");
}

function validateCalendarEvent(event: CalendarEvent) {
  if (!event.id.trim()) {
    throw new Error("calendar event id is required.");
  }

  if (!event.title.trim()) {
    throw new Error("calendar event title is required.");
  }

  assertDate(event.date);
  validateTimeRange(event.startTime, event.endTime, event.endDayOffset);
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }

    if (a.startTime !== b.startTime) {
      return a.startTime < b.startTime ? -1 : 1;
    }

    if (a.endTime !== b.endTime) {
      return a.endTime < b.endTime ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
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
    if (this.events.some((existingEvent) => existingEvent.id === event.id)) {
      throw new Error(`calendar event already exists: ${event.id}`);
    }

    this.events.push({ ...event });
    return { ...event };
  }

  updateEvent(id: string, patch: CalendarEventPatch): CalendarEvent {
    const eventIndex = this.events.findIndex((event) => event.id === id);
    if (eventIndex === -1) {
      throw new Error(`calendar event not found: ${id}`);
    }

    const updatedEvent = { ...this.events[eventIndex], ...patch, id };
    validateCalendarEvent(updatedEvent);
    this.events[eventIndex] = updatedEvent;

    return { ...updatedEvent };
  }

  removeEvent(id: string): boolean {
    const eventIndex = this.events.findIndex((event) => event.id === id);
    if (eventIndex === -1) {
      return false;
    }

    this.events.splice(eventIndex, 1);
    return true;
  }

  getEvent(id: string): CalendarEvent | null {
    const event = this.events.find((existingEvent) => existingEvent.id === id);
    return event ? { ...event } : null;
  }

  getScheduleBlocks(): ScheduleBlock[] {
    return this.scheduleBlocks.map((block) => ({ ...block, daysOfWeek: [...block.daysOfWeek] }));
  }

  getEvents(): CalendarEvent[] {
    return sortEvents(this.events).map((event) => ({ ...event }));
  }

  getEventsForDate(date: Date | string): CalendarEvent[] {
    const dateKey = toDateKey(date);
    const previousDate = shiftDate(dateKey, -1);
    const result: CalendarEvent[] = [];
    const clip = (event: CalendarEvent) => {
      if (event.date === dateKey) {
        result.push(event.endDayOffset ? { ...event, originalDate: event.date, originalStartTime: event.startTime, originalEndTime: event.endTime, endTime: "24:00" } : event);
      } else if (event.date === previousDate && event.endDayOffset && event.endTime !== "00:00") {
        result.push({ ...event, id: `${event.id}:continuation`, sourceId: event.sourceId ?? event.id, date: dateKey, startTime: "00:00", originalDate: event.date, originalStartTime: event.startTime, originalEndTime: event.endTime });
      }
    };
    for (const origin of [previousDate, dateKey]) {
      for (const block of this.scheduleBlocks) {
        if (!block.daysOfWeek.includes(dayOfWeekFromDateKey(origin)) || (block.effectiveFrom && origin < block.effectiveFrom) || (block.effectiveUntil && origin > block.effectiveUntil)) continue;
        clip({ id: `${block.id}:${origin}`, sourceId: block.id, title: block.title, category: block.category, date: origin, startTime: block.startTime, endTime: block.endTime, endDayOffset: block.endDayOffset, timezone: block.timezone, source: "recurring_schedule" });
      }
    }
    for (const event of this.events) clip(event);
    return sortEvents(result);
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

/** Calendar arithmetic uses date components, never elapsed milliseconds across DST. */
export function shiftDate(date: string, days: number): string {
  assertDate(date);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Activities the calendar can be filtered by: the manual/recurring categories plus the
 * course item kinds, so a user can e.g. show only exams and assignments.
 */
export type CalendarActivity = ScheduleBlockCategory | CourseItemKind;

export const calendarActivityOptions: Array<{ value: CalendarActivity; label: string }> = [
  { value: "exam", label: "Exams & tests" },
  { value: "quiz", label: "Quizzes" },
  { value: "assignment", label: "Assignments" },
  { value: "school", label: "School" },
  { value: "study", label: "Study" },
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "unavailable", label: "Unavailable" },
];

export function calendarEventActivity(event: Pick<CalendarEvent, "category" | "course">): CalendarActivity {
  return event.course ? event.course.kind : event.category;
}

export function isActivityVisible(activity: CalendarActivity, hidden: readonly CalendarActivity[]): boolean {
  return !hidden.includes(activity);
}

/** Label for an event pill: deadlines show when they are due, everything else its start. */
export function calendarEventTimeLabel(event: Pick<CalendarEvent, "startTime" | "course">): string {
  return event.course?.isDeadline ? `Due ${event.course.dueTime}` : event.startTime;
}
