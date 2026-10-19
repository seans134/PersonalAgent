import type { StudyItem } from "@personal-agent/core";
import type { CalendarEvent as LocalCalendarEvent } from "@personal-agent/core/calendar";
import type { CalendarEvent } from "@/lib/planner/types";
import { localDateOnly, localParts } from "./local-time";
import type { CourseItemRow } from "./types";

export type ProjectedEvent = {
  id: string;
  title: string;
  category: "school";
  kind: CourseItemRow["kind"];
  localDate: string;
  startTime: string;
  endTime: string;
  isDeadline: boolean;
};

function addMinutesToClock(time: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes);
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function defaultDurationMinutes(kind: CourseItemRow["kind"]): number {
  return kind === "exam" ? 120 : 60;
}

export function projectCourseItemsToEvents(items: CourseItemRow[], timeZone: string): ProjectedEvent[] {
  return items.map((item) => {
    const start = localParts(item.due_at, timeZone);
    if (item.kind === "assignment") {
      return {
        id: `course-${item.id}`, title: item.title, category: "school", kind: item.kind,
        localDate: start.date, startTime: start.time, endTime: start.time, isDeadline: true,
      };
    }
    let endTime: string;
    if (item.end_at) {
      const end = localParts(item.end_at, timeZone);
      endTime = end.date === start.date ? end.time : "23:59";
    } else {
      endTime = addMinutesToClock(start.time, defaultDurationMinutes(item.kind));
    }
    return {
      id: `course-${item.id}`, title: item.title, category: "school", kind: item.kind,
      localDate: start.date, startTime: start.time, endTime, isDeadline: false,
    };
  });
}

export function courseItemsToTodayBusyEvents(
  items: CourseItemRow[],
  timeZone: string,
  todayLocalDate: string,
): CalendarEvent[] {
  return projectCourseItemsToEvents(items, timeZone)
    .filter((event) => !event.isDeadline && event.localDate === todayLocalDate)
    .map((event) => ({
      id: event.id, title: event.title, category: event.category,
      startTime: event.startTime, endTime: event.endTime,
    }));
}

export function courseItemsToStudyItems(
  items: CourseItemRow[],
  courseNameById: Map<string, string>,
  timeZone: string,
): StudyItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    courseName: courseNameById.get(item.course_id) ?? "Course",
    kind: item.kind,
    dueLocalDate: localDateOnly(item.due_at, timeZone),
    scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
    estimatedEffortHours: item.estimated_effort_hours === null ? null : Number(item.estimated_effort_hours),
    focusMode: item.focus_mode,
  }));
}

const MIN_VISIBLE_MINUTES = 30;
const LAST_MINUTE = 23 * 60 + 59;

function clockToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function minutesToClock(total: number): string {
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

// The local Calendar model rejects zero-length events, so deadline markers (and anything
// squeezed against midnight) get a short visible block that stays on the same day.
function visibleRange(startTime: string, endTime: string): { startTime: string; endTime: string } {
  let start = clockToMinutes(startTime);
  let end = clockToMinutes(endTime);
  if (end - start < MIN_VISIBLE_MINUTES) {
    start = Math.min(start, LAST_MINUTE - MIN_VISIBLE_MINUTES);
    end = Math.max(end, start + MIN_VISIBLE_MINUTES);
  }
  return { startTime: minutesToClock(start), endTime: minutesToClock(end) };
}

/** Course items shaped for the local calendar (web /calendar/local and mobile). */
export function courseItemsToCalendarEvents(
  items: CourseItemRow[],
  courseNameById: Map<string, string>,
  timeZone: string,
): LocalCalendarEvent[] {
  const byId = new Map(items.map((item) => [`course-${item.id}`, item]));
  return projectCourseItemsToEvents(items, timeZone).map((projected) => {
    const item = byId.get(projected.id)!;
    return {
      id: projected.id,
      title: projected.title,
      category: "school",
      date: projected.localDate,
      ...visibleRange(projected.startTime, projected.endTime),
      source: "course",
      sourceId: item.id,
      course: {
        itemId: item.id,
        courseId: item.course_id,
        courseName: courseNameById.get(item.course_id) ?? "Course",
        kind: item.kind,
        isDeadline: projected.isDeadline,
        dueTime: projected.startTime,
      },
    };
  });
}
