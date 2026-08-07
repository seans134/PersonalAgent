"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import { Calendar, type CalendarEvent, type ScheduleBlock, type ScheduleBlockCategory } from "@personal-agent/core/calendar";
import { createClient } from "@/lib/supabase/client";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const calendarViews = ["day", "week", "month"] as const;
const categoryOptions: ScheduleBlockCategory[] = ["personal", "work", "study", "school", "unavailable"];

type CalendarView = (typeof calendarViews)[number];

type SelectedSlot = {
  dateKey: string;
  startTime: string;
  endTime: string;
};

type EventFormState = {
  title: string;
  category: ScheduleBlockCategory;
  date: string;
  startTime: string;
  endTime: string;
  recurrence: "single" | "weekly";
};

type EditingTarget =
  | { id: string; type: "single" }
  | { id: string; type: "recurring" };

type CalendarEventRow = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  event_date: string;
  start_time: string;
  end_time: string;
};

type ScheduleBlockRow = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  timezone: string | null;
};

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlankCount = firstDay.getDay();

  return [
    ...Array.from({ length: leadingBlankCount }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1)),
  ];
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function getWeekDays(weekDate: Date) {
  const weekStart = addDays(weekDate, -weekDate.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatMonth(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDay(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function parseCalendarView(value: string | null): CalendarView {
  return calendarViews.find((view) => view === value) ?? "month";
}

function parseDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(2026, 5, 8);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return new Date(2026, 5, 8);
  }

  return parsedDate;
}

function getShiftedDate(value: Date, view: CalendarView, direction: "previous" | "next") {
  const amount = direction === "previous" ? -1 : 1;

  if (view === "day") {
    return addDays(value, amount);
  }

  if (view === "week") {
    return addDays(value, amount * 7);
  }

  return addMonths(value, amount);
}

function calendarHref(view: CalendarView, date: Date) {
  return `/calendar/local?view=${view}&date=${toDateKey(date)}`;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toTimeString(hour: number, minute = 0) {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function normalizeDbTime(value: string) {
  return value.slice(0, 5);
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function slotForHour(dateKey: string, hour: number): SelectedSlot {
  return {
    dateKey,
    startTime: toTimeString(hour),
    endTime: hour === 23 ? "23:59" : toTimeString(hour + 1),
  };
}

function eventOverlapsHour(event: CalendarEvent, hour: number) {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  return toMinutes(event.startTime) < hourEnd && toMinutes(event.endTime) > hourStart;
}

function eventColor(category: CalendarEvent["category"]) {
  if (category === "work") return "border-focus/30 bg-focus/10 text-focus";
  if (category === "study") return "border-warning/40 bg-warning/10 text-warning";
  if (category === "personal") return "border-success/40 bg-success/10 text-success";
  if (category === "unavailable") return "border-line bg-surface2 text-ink-muted";
  return "border-goal/30 bg-goal/10 text-goal";
}

function clickStartedOnEvent(clickEvent: MouseEvent<HTMLElement>) {
  return clickEvent.target instanceof HTMLElement && clickEvent.target.closest("[data-calendar-event]");
}

function toCalendarEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    date: row.event_date,
    startTime: normalizeDbTime(row.start_time),
    endTime: normalizeDbTime(row.end_time),
    source: "manual",
  };
}

function toScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    daysOfWeek: row.days_of_week as ScheduleBlock["daysOfWeek"],
    startTime: normalizeDbTime(row.start_time),
    endTime: normalizeDbTime(row.end_time),
    timezone: row.timezone ?? undefined,
  };
}

function ViewSwitcher({
  currentDate,
  currentView,
}: {
  currentDate: Date;
  currentView: CalendarView;
}) {
  return (
    <div
      className="rounded-lg border border-line bg-surface p-1 shadow-sm"
      style={{ display: "inline-flex", alignItems: "stretch", height: "2.75rem", width: "fit-content" }}
    >
      {calendarViews.map((view) => {
        const isActive = view === currentView;

        return (
          <Link
            className={`inline-flex items-center rounded-md px-4 text-sm font-medium capitalize transition ${
              isActive ? "bg-teal text-on-teal" : "text-ink-muted hover:bg-surface2 hover:text-ink"
            }`}
            href={calendarHref(view, currentDate)}
            key={view}
          >
            {view}
          </Link>
        );
      })}
    </div>
  );
}

function CalendarNavigation({
  currentDate,
  currentView,
}: {
  currentDate: Date;
  currentView: CalendarView;
}) {
  const previousDate = getShiftedDate(currentDate, currentView, "previous");
  const nextDate = getShiftedDate(currentDate, currentView, "next");

  return (
    <div
      className="rounded-lg border border-line bg-surface shadow-sm"
      style={{ display: "inline-flex", alignItems: "stretch", height: "2.75rem", width: "fit-content" }}
    >
      <Link
        className="inline-flex items-center border-r border-line px-4 text-sm font-medium text-ink-muted transition hover:bg-surface2 hover:text-ink"
        href={calendarHref(currentView, previousDate)}
      >
        Previous
      </Link>
      <Link
        className="inline-flex items-center px-4 text-sm font-medium text-ink-muted transition hover:bg-surface2 hover:text-ink"
        href={calendarHref(currentView, nextDate)}
      >
        Next
      </Link>
    </div>
  );
}

function EventPill({
  event,
  onEditEvent,
}: {
  event: CalendarEvent;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  return (
    <button
      className={`w-full truncate rounded border px-2 py-1 text-left text-xs font-medium ${eventColor(event.category)}`}
      data-calendar-event="true"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onEditEvent(event);
      }}
      title={`${event.startTime} - ${event.endTime} ${event.title}`}
      type="button"
    >
      {event.startTime} {event.title}
    </button>
  );
}

function MonthCalendar({
  calendar,
  monthDays,
  onEditEvent,
  onSelectSlot,
  todayKey,
}: {
  calendar: Calendar;
  monthDays: Array<Date | null>;
  onEditEvent: (event: CalendarEvent) => void;
  onSelectSlot: (slot: SelectedSlot) => void;
  todayKey: string;
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
      <div className="min-w-[44rem]">
        <div
          className="border-b border-line bg-surface2"
          style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {weekdayLabels.map((label) => (
            <div className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted" key={label}>
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {monthDays.map((day, index) => {
            if (!day) {
              return <div className="min-h-32 border-r border-t border-line bg-surface2/70" key={`blank-${index}`} />;
            }

            const dateKey = toDateKey(day);
            const events = calendar.getEventsForDate(dateKey);
            const isToday = dateKey === todayKey;

            return (
              <div
                className={`min-h-32 border-r border-t border-line p-2 text-left transition hover:bg-surface2 ${
                  isToday ? "bg-teal/10" : "bg-surface"
                }`}
                key={dateKey}
                onClick={(clickEvent) => {
                  if (clickStartedOnEvent(clickEvent)) return;
                  onSelectSlot({ dateKey, startTime: "09:00", endTime: "10:00" });
                }}
                role="button"
                tabIndex={0}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday ? "bg-teal text-on-teal" : "text-ink"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>

                <div className="space-y-1">
                  {events.slice(0, 3).map((event) => (
                    <EventPill event={event} key={event.id} onEditEvent={onEditEvent} />
                  ))}
                  {events.length > 3 ? (
                    <p className="px-1 text-xs font-medium text-ink-muted">+{events.length - 3} more</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WeekCalendar({
  calendar,
  onEditEvent,
  onSelectSlot,
  todayKey,
  weekDays,
}: {
  calendar: Calendar;
  onEditEvent: (event: CalendarEvent) => void;
  onSelectSlot: (slot: SelectedSlot) => void;
  todayKey: string;
  weekDays: Date[];
}) {
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <section className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
      <div className="min-w-[56rem]">
        <div
          className="border-b border-line bg-surface2"
          style={{ display: "grid", gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}
        >
          <div className="border-r border-line px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Time
          </div>
          {weekDays.map((day) => {
            const dateKey = toDateKey(day);
            const isToday = dateKey === todayKey;

            return (
              <div className={`border-r border-line px-3 py-3 text-center ${isToday ? "bg-teal/10" : ""}`} key={dateKey}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{weekdayLabels[day.getDay()]}</p>
                <p className={`mt-1 text-lg font-semibold ${isToday ? "text-ink" : "text-ink"}`}>{day.getDate()}</p>
              </div>
            );
          })}
        </div>

        {hours.map((hour) => (
          <div
            className="border-t border-line"
            key={hour}
            style={{ display: "grid", gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}
          >
            <div className="border-r border-line bg-surface2 px-3 py-2 text-right text-xs font-medium text-ink-muted">
              {formatHour(hour)}
            </div>
            {weekDays.map((day) => {
              const dateKey = toDateKey(day);
              const isToday = dateKey === todayKey;
              const events = calendar.getEventsForDate(dateKey).filter((event) => eventOverlapsHour(event, hour));

              if (events.length === 0) {
                return (
                  <div
                    className={`min-h-11 border-r border-line p-1 text-left transition hover:bg-surface2 ${
                      isToday ? "bg-teal/10" : "bg-surface"
                    }`}
                    key={`${dateKey}-${hour}`}
                    onClick={() => onSelectSlot(slotForHour(dateKey, hour))}
                    role="button"
                    tabIndex={0}
                  />
                );
              }

              return (
                <div
                  className={`min-h-11 border-r border-line p-1 text-left ${
                    isToday ? "bg-teal/10" : "bg-surface"
                  }`}
                  key={`${dateKey}-${hour}`}
                >
                  <div className="space-y-1">
                    {events.map((event) => (
                      <button
                        className={`w-full truncate rounded border px-2 py-1 text-left text-[11px] font-medium leading-tight ${eventColor(event.category)}`}
                        data-calendar-event="true"
                        key={`${event.id}-${hour}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onEditEvent(event);
                        }}
                        title={`${event.startTime} - ${event.endTime} ${event.title}`}
                        type="button"
                      >
                        {event.startTime} {event.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function DayCalendar({
  calendar,
  dateKey,
  onEditEvent,
  onSelectSlot,
}: {
  calendar: Calendar;
  dateKey: string;
  onEditEvent: (event: CalendarEvent) => void;
  onSelectSlot: (slot: SelectedSlot) => void;
}) {
  const day = new Date(`${dateKey}T00:00:00`);
  const events = calendar.getEventsForDate(dateKey);
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <section className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
      <div className="min-w-[34rem]">
        <div
          className="border-b border-line bg-surface2"
          style={{ display: "grid", gridTemplateColumns: "4.5rem minmax(0, 1fr)" }}
        >
          <div className="border-r border-line px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Time
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{weekdayLabels[day.getDay()]}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{formatDay(day)}</p>
          </div>
        </div>

        {hours.map((hour) => {
          const hourEvents = events.filter((event) => eventOverlapsHour(event, hour));

          return (
            <div
              className="border-t border-line"
              key={hour}
              style={{ display: "grid", gridTemplateColumns: "4.5rem minmax(0, 1fr)" }}
            >
              <div className="border-r border-line bg-surface2 px-3 py-2 text-right text-xs font-medium text-ink-muted">
                {formatHour(hour)}
              </div>
              {hourEvents.length === 0 ? (
                <div
                  className="min-h-11 bg-surface p-1 text-left transition hover:bg-surface2"
                  onClick={() => onSelectSlot(slotForHour(dateKey, hour))}
                  role="button"
                  tabIndex={0}
                />
              ) : (
                <div className="min-h-11 bg-surface p-1 text-left">
                  <div className="space-y-1">
                    {hourEvents.map((event) => (
                      <button
                        className={`w-full truncate rounded border px-2 py-1 text-left text-[11px] font-medium leading-tight ${eventColor(event.category)}`}
                        data-calendar-event="true"
                        key={`${event.id}-${hour}`}
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onEditEvent(event);
                        }}
                        title={`${event.startTime} - ${event.endTime} ${event.title}`}
                        type="button"
                      >
                        {event.startTime} {event.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EventModal({
  error,
  form,
  isEditing,
  onChange,
  onClose,
  onSubmit,
}: {
  error: string;
  form: EventFormState;
  isEditing: boolean;
  onChange: (patch: Partial<EventFormState>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-teal/50 px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">{isEditing ? "Edit event" : "New event"}</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{form.date}</h2>
          </div>
          <button className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface2" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Title</span>
            <input
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="Event title"
              value={form.title}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-ink">Date</span>
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                onChange={(event) => onChange({ date: event.target.value })}
                type="date"
                value={form.date}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Start</span>
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                onChange={(event) => onChange({ startTime: event.target.value })}
                type="time"
                value={form.startTime}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">End</span>
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                onChange={(event) => onChange({ endTime: event.target.value })}
                type="time"
                value={form.endTime}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-ink">Category</span>
              <select
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm capitalize text-ink"
                onChange={(event) => onChange({ category: event.target.value as ScheduleBlockCategory })}
                value={form.category}
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-ink">Repeat</span>
              <select
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
                onChange={(event) => onChange({ recurrence: event.target.value as EventFormState["recurrence"] })}
                value={form.recurrence}
              >
                <option value="single">Single event</option>
                <option value="weekly">Weekly on this weekday</option>
              </select>
            </label>
          </div>

          {error ? <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal" type="submit">
              {isEditing ? "Save changes" : "Add event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LocalCalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const selectedView = parseCalendarView(searchParams.get("view"));
  const selectedDate = parseDateParam(searchParams.get("date"));
  const visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const todayKey = "2026-06-08";
  const [userId, setUserId] = useState("");
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [manualEvents, setManualEvents] = useState<CalendarEvent[]>([]);
  const [recurringBlocks, setRecurringBlocks] = useState<ScheduleBlock[]>([]);
  const [modalError, setModalError] = useState("");
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCalendarData() {
      setIsLoadingCalendar(true);
      setLoadError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError) {
        setLoadError(userError.message);
        setIsLoadingCalendar(false);
        return;
      }

      if (!user) {
        setUserId("");
        setManualEvents([]);
        setRecurringBlocks([]);
        setIsLoadingCalendar(false);
        return;
      }

      setUserId(user.id);

      const [eventsResult, blocksResult] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, title, category, event_date, start_time, end_time")
          .eq("user_id", user.id)
          .order("event_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("schedule_blocks")
          .select("id, title, category, days_of_week, start_time, end_time, timezone")
          .eq("user_id", user.id)
          .order("start_time", { ascending: true }),
      ]);

      if (!isMounted) return;

      if (eventsResult.error || blocksResult.error) {
        setLoadError(eventsResult.error?.message ?? blocksResult.error?.message ?? "Unable to load calendar.");
        setIsLoadingCalendar(false);
        return;
      }

      setManualEvents(((eventsResult.data ?? []) as CalendarEventRow[]).map(toCalendarEvent));
      setRecurringBlocks(((blocksResult.data ?? []) as ScheduleBlockRow[]).map(toScheduleBlock));
      setIsLoadingCalendar(false);
    }

    void loadCalendarData();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const calendar = useMemo(
    () =>
      new Calendar({
        scheduleBlocks: recurringBlocks,
        events: manualEvents,
      }),
    [manualEvents, recurringBlocks],
  );

  const monthDays = getMonthDays(visibleMonth);
  const weekDays = getWeekDays(selectedDate);
  const todayEvents = calendar.getEventsForDate(todayKey);
  const title =
    selectedView === "month"
      ? formatMonth(visibleMonth)
      : selectedView === "week"
        ? `Week of ${formatDay(weekDays[0])}`
        : formatDay(selectedDate);

  function openEventModal(slot: SelectedSlot) {
    setModalError("");
    setEditingTarget(null);
    setEventForm({
      title: "",
      category: "personal",
      date: slot.dateKey,
      startTime: slot.startTime,
      endTime: slot.endTime,
      recurrence: "single",
    });
  }

  function openEditEventModal(event: CalendarEvent) {
    setModalError("");
    setEditingTarget(
      event.source === "recurring_schedule" && event.sourceId
        ? { id: event.sourceId, type: "recurring" }
        : { id: event.id, type: "single" },
    );
    setEventForm({
      title: event.title,
      category: event.category,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      recurrence: event.source === "recurring_schedule" ? "weekly" : "single",
    });
  }

  function closeEventModal() {
    setModalError("");
    setEventForm(null);
    setEditingTarget(null);
  }

  function updateEventForm(patch: Partial<EventFormState>) {
    setEventForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventForm) return;

    if (!userId) {
      setModalError("Sign in before saving calendar events.");
      return;
    }

    const title = eventForm.title.trim();
    if (!title) {
      setModalError("Add a title before saving.");
      return;
    }

    if (eventForm.endTime <= eventForm.startTime) {
      setModalError("End time must be after start time.");
      return;
    }

    if (eventForm.recurrence === "weekly") {
      const date = parseDateParam(eventForm.date);
      const blockPayload = {
        user_id: userId,
        title,
        category: eventForm.category,
        days_of_week: [date.getDay()],
        start_time: eventForm.startTime,
        end_time: eventForm.endTime,
        timezone: "America/Toronto",
      };

      if (editingTarget?.type === "single") {
        const [deleteResult, insertResult] = await Promise.all([
          supabase.from("calendar_events").delete().eq("id", editingTarget.id).eq("user_id", userId),
          supabase.from("schedule_blocks").insert(blockPayload).select("id, title, category, days_of_week, start_time, end_time, timezone").single(),
        ]);

        if (deleteResult.error || insertResult.error || !insertResult.data) {
          setModalError(deleteResult.error?.message ?? insertResult.error?.message ?? "Unable to save event.");
          return;
        }

        setManualEvents((current) => current.filter((manualEvent) => manualEvent.id !== editingTarget.id));
        setRecurringBlocks((current) => [...current, toScheduleBlock(insertResult.data as ScheduleBlockRow)]);
      } else if (editingTarget?.type === "recurring") {
        const { data, error } = await supabase
          .from("schedule_blocks")
          .update(blockPayload)
          .eq("id", editingTarget.id)
          .eq("user_id", userId)
          .select("id, title, category, days_of_week, start_time, end_time, timezone")
          .single();

        if (error || !data) {
          setModalError(error?.message ?? "Unable to save event.");
          return;
        }

        const nextBlock = toScheduleBlock(data as ScheduleBlockRow);
        setRecurringBlocks((current) =>
          current.map((block) => (block.id === editingTarget.id ? nextBlock : block)),
        );
      } else {
        const { data, error } = await supabase
          .from("schedule_blocks")
          .insert(blockPayload)
          .select("id, title, category, days_of_week, start_time, end_time, timezone")
          .single();

        if (error || !data) {
          setModalError(error?.message ?? "Unable to save event.");
          return;
        }

        setRecurringBlocks((current) => [...current, toScheduleBlock(data as ScheduleBlockRow)]);
      }
    } else {
      const eventPayload = {
        user_id: userId,
        title,
        category: eventForm.category,
        event_date: eventForm.date,
        start_time: eventForm.startTime,
        end_time: eventForm.endTime,
      };

      if (editingTarget?.type === "recurring") {
        const [deleteResult, insertResult] = await Promise.all([
          supabase.from("schedule_blocks").delete().eq("id", editingTarget.id).eq("user_id", userId),
          supabase.from("calendar_events").insert(eventPayload).select("id, title, category, event_date, start_time, end_time").single(),
        ]);

        if (deleteResult.error || insertResult.error || !insertResult.data) {
          setModalError(deleteResult.error?.message ?? insertResult.error?.message ?? "Unable to save event.");
          return;
        }

        setRecurringBlocks((current) => current.filter((block) => block.id !== editingTarget.id));
        setManualEvents((current) => [...current, toCalendarEvent(insertResult.data as CalendarEventRow)]);
      } else if (editingTarget?.type === "single") {
        const { data, error } = await supabase
          .from("calendar_events")
          .update(eventPayload)
          .eq("id", editingTarget.id)
          .eq("user_id", userId)
          .select("id, title, category, event_date, start_time, end_time")
          .single();

        if (error || !data) {
          setModalError(error?.message ?? "Unable to save event.");
          return;
        }

        const nextEvent = toCalendarEvent(data as CalendarEventRow);
        setManualEvents((current) =>
          current.map((manualEvent) => (manualEvent.id === editingTarget.id ? nextEvent : manualEvent)),
        );
      } else {
        const { data, error } = await supabase
          .from("calendar_events")
          .insert(eventPayload)
          .select("id, title, category, event_date, start_time, end_time")
          .single();

        if (error || !data) {
          setModalError(error?.message ?? "Unable to save event.");
          return;
        }

        setManualEvents((current) => [...current, toCalendarEvent(data as CalendarEventRow)]);
      }
    }

    closeEventModal();
  }

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <Link
        className="text-sm font-medium text-ink-muted underline"
        href="/"
        style={{ position: "fixed", right: "1.5rem", top: "1.5rem", zIndex: 20 }}
      >
        Back home
      </Link>

      <header className="mb-8 pr-24">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Local calendar</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            A simple local calendar view powered by the app&apos;s calendar model.
          </p>
        </div>
      </header>

      {isLoadingCalendar ? (
        <section className="rounded-lg border border-line bg-surface p-6 text-ink-muted shadow-sm">
          Loading calendar...
        </section>
      ) : !userId ? (
        <section className="rounded-lg border border-line bg-surface p-6 shadow-sm">
          <p className="text-ink-muted">Sign in to save calendar events.</p>
          <Link className="mt-4 inline-flex rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal" href="/auth">
            Go to auth
          </Link>
        </section>
      ) : loadError ? (
        <section className="rounded-lg border border-danger bg-surface p-6 text-sm text-danger shadow-sm">
          {loadError}
        </section>
      ) : (
        <>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div
            className="mb-4"
            style={{
              alignItems: "center",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <ViewSwitcher currentDate={selectedDate} currentView={selectedView} />
            <CalendarNavigation currentDate={selectedDate} currentView={selectedView} />
          </div>

          {selectedView === "day" ? (
            <DayCalendar
              calendar={calendar}
              dateKey={toDateKey(selectedDate)}
              onEditEvent={openEditEventModal}
              onSelectSlot={openEventModal}
            />
          ) : selectedView === "week" ? (
            <WeekCalendar
              calendar={calendar}
              onEditEvent={openEditEventModal}
              onSelectSlot={openEventModal}
              todayKey={todayKey}
              weekDays={weekDays}
            />
          ) : (
            <MonthCalendar
              calendar={calendar}
              monthDays={monthDays}
              onEditEvent={openEditEventModal}
              onSelectSlot={openEventModal}
              todayKey={todayKey}
            />
          )}
        </div>

        <aside className="rounded-lg border border-line bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Today</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">June 8</h2>

          <div className="mt-5 space-y-3">
            {todayEvents.map((event) => (
              <button
                className={`w-full rounded-lg border p-3 text-left ${eventColor(event.category)}`}
                key={event.id}
                onClick={() => openEditEventModal(event)}
                type="button"
              >
                <p className="text-sm font-semibold">{event.title}</p>
                <p className="mt-1 text-xs">
                  {event.startTime} - {event.endTime}
                </p>
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-sm font-medium text-ink">Free windows</p>
            <ul className="mt-3 space-y-2">
              {calendar.getFreeWindows(todayKey, "08:00", "20:00").map((window) => (
                <li className="rounded-lg bg-surface2 px-3 py-2 text-sm text-ink-muted" key={`${window.startTime}-${window.endTime}`}>
                  {window.startTime} - {window.endTime}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
        </>
      )}

      {eventForm ? (
        <EventModal
          error={modalError}
          form={eventForm}
          isEditing={editingTarget !== null}
          onChange={updateEventForm}
          onClose={closeEventModal}
          onSubmit={handleSubmitEvent}
        />
      ) : null}
    </main>
  );
}
