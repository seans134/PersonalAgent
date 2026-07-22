import {
  Calendar,
  type CalendarEvent,
  type DayOfWeek,
  type ScheduleBlockCategory,
} from "@personal-agent/core/calendar";
import type { MobileCalendarResponse } from "./api";

export const calendarViews = ["day", "week", "month"] as const;

export type CalendarView = (typeof calendarViews)[number];

export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const categoryOptions: ScheduleBlockCategory[] = [
  "personal",
  "work",
  "study",
  "school",
  "unavailable",
];

type CategoryColor = {
  border: string;
  background: string;
  text: string;
};

// Mirrors the Tailwind palette used by the web calendar at /calendar/local.
const categoryColors: Record<ScheduleBlockCategory, CategoryColor> = {
  work: { border: "#bfdbfe", background: "#eff6ff", text: "#1e3a8a" },
  study: { border: "#fde68a", background: "#fffbeb", text: "#451a03" },
  personal: { border: "#a7f3d0", background: "#ecfdf5", text: "#022c22" },
  unavailable: { border: "#d4d4d8", background: "#f4f4f5", text: "#27272a" },
  school: { border: "#ddd6fe", background: "#f5f3ff", text: "#2e1065" },
};

export function eventColor(category: ScheduleBlockCategory) {
  return categoryColors[category] ?? categoryColors.school;
}

export function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

export function getMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const leadingBlankCount = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return [
    ...Array.from({ length: leadingBlankCount }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1)),
  ];
}

export function getWeekDays(weekDate: Date) {
  const weekStart = addDays(weekDate, -weekDate.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function getShiftedDate(value: Date, view: CalendarView, direction: "previous" | "next") {
  const amount = direction === "previous" ? -1 : 1;

  if (view === "day") return addDays(value, amount);
  if (view === "week") return addDays(value, amount * 7);
  return addMonths(value, amount);
}

export function formatMonth(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function formatDay(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function toTimeString(hour: number, minute = 0) {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function eventOverlapsHour(event: CalendarEvent, hour: number) {
  const hourStart = hour * 60;
  return toMinutes(event.startTime) < hourStart + 60 && toMinutes(event.endTime) > hourStart;
}

/**
 * The Calendar model validates every item and throws on the first bad one. A single
 * malformed row should not blank the whole screen, so items are added individually
 * and anything that fails validation is skipped.
 */
export function buildCalendar(snapshot: MobileCalendarResponse | null) {
  const calendar = new Calendar();
  if (!snapshot) return calendar;

  for (const block of snapshot.scheduleBlocks) {
    try {
      calendar.addScheduleBlock({
        id: block.id,
        title: block.title,
        category: block.category,
        daysOfWeek: block.daysOfWeek as DayOfWeek[],
        startTime: block.startTime,
        endTime: block.endTime,
        timezone: block.timezone,
      });
    } catch {
      // Skip unusable schedule blocks.
    }
  }

  for (const event of snapshot.events) {
    try {
      calendar.addEvent({
        id: event.id,
        title: event.title,
        category: event.category,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        source: "manual",
      });
    } catch {
      // Skip unusable events.
    }
  }

  return calendar;
}
