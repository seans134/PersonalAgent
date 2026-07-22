"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Calendar, type ScheduleBlock, type ScheduleBlockCategory } from "@personal-agent/core/calendar";
import { createClient } from "@/lib/supabase/client";

type ScheduleBlockRow = {
  id: string;
  title: string;
  category: ScheduleBlockCategory;
  days_of_week: number[];
  start_time: string;
  end_time: string;
};

type ScheduleCategory = ScheduleBlockCategory;

type SelectedSlot = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type ScheduleFormState = {
  title: string;
  category: ScheduleCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, index) => index);
const referenceWeekStart = new Date(2026, 5, 7);

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
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

function toMinutes(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":").map(Number);
  return hoursRaw * 60 + minutesRaw;
}

function eventOverlapsHour(event: { startTime: string; endTime: string }, hour: number) {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  return toMinutes(event.startTime) < hourEnd && toMinutes(event.endTime) > hourStart;
}

function slotForHour(dayOfWeek: number, hour: number): SelectedSlot {
  return {
    dayOfWeek,
    startTime: toTimeString(hour),
    endTime: hour === 23 ? "23:59" : toTimeString(hour + 1),
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
  };
}

function blockColor(category: ScheduleBlockCategory) {
  if (category === "work") return "border-blue-200 bg-blue-50 text-blue-900";
  if (category === "study") return "border-amber-200 bg-amber-50 text-amber-950";
  if (category === "personal") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (category === "unavailable") return "border-zinc-300 bg-zinc-100 text-zinc-800";
  return "border-violet-200 bg-violet-50 text-violet-950";
}

function formatCategory(category: ScheduleCategory) {
  if (category === "school") return "School";
  if (category === "work") return "Work";
  if (category === "study") return "Study";
  if (category === "unavailable") return "Unavailable";
  return "Personal";
}

function placeholderForCategory(category: ScheduleCategory) {
  if (category === "school") return "Biology lecture";
  if (category === "work") return "Closing shift";
  if (category === "study") return "Exam review";
  if (category === "unavailable") return "Blocked time";
  return "Gym, dinner, family time";
}

export function OnboardingScheduleCalendar({
  categories = ["school", "work"],
  defaultCategory = "school",
  initialBlocks,
  userId,
  visibleCategories = categories,
}: {
  categories?: ScheduleCategory[];
  defaultCategory?: ScheduleCategory;
  initialBlocks: ScheduleBlockRow[];
  userId: string;
  visibleCategories?: ScheduleCategory[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(initialBlocks.map(toScheduleBlock));
  const [activeCategory, setActiveCategory] = useState<ScheduleCategory>(defaultCategory);
  const [form, setForm] = useState<ScheduleFormState | null>(null);
  const [editingBlockId, setEditingBlockId] = useState("");
  const [error, setError] = useState("");

  const calendar = useMemo(() => new Calendar({ scheduleBlocks: blocks }), [blocks]);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(referenceWeekStart, index));

  useEffect(() => {
    setBlocks(initialBlocks.map(toScheduleBlock));
  }, [initialBlocks]);

  function openModal(slot: SelectedSlot) {
    setError("");
    setEditingBlockId("");
    setForm({
      title: "",
      category: activeCategory,
      daysOfWeek: [slot.dayOfWeek],
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
  }

  function openEditModal(blockId: string) {
    const block = blocks.find((currentBlock) => currentBlock.id === blockId);
    if (!block || !categories.includes(block.category)) return;

    setError("");
    setEditingBlockId(block.id);
    setForm({
      title: block.title,
      category: block.category,
      daysOfWeek: [...block.daysOfWeek],
      startTime: block.startTime,
      endTime: block.endTime,
    });
  }

  function closeModal() {
    setForm(null);
    setEditingBlockId("");
    setError("");
  }

  function updateForm(patch: Partial<ScheduleFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const title = form.title.trim();
    if (!title) {
      setError("Add a name before saving.");
      return;
    }

    if (form.daysOfWeek.length === 0) {
      setError("Choose at least one day.");
      return;
    }

    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      return;
    }

    const payload = {
      user_id: userId,
      title,
      category: form.category,
      days_of_week: [...new Set(form.daysOfWeek)].sort((a, b) => a - b),
      start_time: form.startTime,
      end_time: form.endTime,
      timezone: "America/Toronto",
    };

    const query = editingBlockId
      ? supabase
          .from("schedule_blocks")
          .update(payload)
          .eq("id", editingBlockId)
          .eq("user_id", userId)
      : supabase.from("schedule_blocks").insert(payload);

    const { data, error: saveError } = await query
      .select("id, title, category, days_of_week, start_time, end_time")
      .single();

    if (saveError || !data) {
      setError(saveError?.message ?? "Unable to save schedule block.");
      return;
    }

    await supabase.from("user_profiles").upsert(
      {
        user_id: userId,
        has_school_schedule: form.category === "school" ? true : undefined,
        has_work_schedule: form.category === "work" ? true : undefined,
      },
      { onConflict: "user_id" },
    );

    const savedBlock = toScheduleBlock(data as ScheduleBlockRow);
    setBlocks((current) =>
      editingBlockId
        ? current.map((block) => (block.id === editingBlockId ? savedBlock : block))
        : [...current, savedBlock],
    );
    closeModal();
  }

  async function removeBlock(id: string) {
    const { error: deleteError } = await supabase.from("schedule_blocks").delete().eq("id", id).eq("user_id", userId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setBlocks((current) => current.filter((block) => block.id !== id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="rounded-lg border border-zinc-300 bg-white p-1 shadow-sm"
          style={{ alignItems: "stretch", display: "inline-flex", height: "2.75rem", width: "fit-content" }}
        >
          {categories.map((category) => (
            <button
              className={`rounded-md px-4 text-sm font-medium capitalize transition ${
                activeCategory === category ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
              }`}
              key={category}
              onClick={() => setActiveCategory(category)}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>

        <div className="flex gap-3 text-sm text-zinc-600">
          {categories.map((category) => (
            <span key={category}>
              {blocks.filter((block) => block.category === category).length} {category}
            </span>
          ))}
        </div>
      </div>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="min-w-[56rem]">
          <div
            className="border-b border-zinc-200 bg-zinc-50"
            style={{ display: "grid", gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}
          >
            <div className="border-r border-zinc-200 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Time
            </div>
            {weekDays.map((day) => (
              <div className="border-r border-zinc-200 px-3 py-3 text-center" key={toDateKey(day)}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{weekdayLabels[day.getDay()]}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-800">{day.getDate()}</p>
              </div>
            ))}
          </div>

          {hours.map((hour) => (
            <div
              className="border-t border-zinc-200"
              key={hour}
              style={{ display: "grid", gridTemplateColumns: "4.5rem repeat(7, minmax(0, 1fr))" }}
            >
              <div className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs font-medium text-zinc-500">
                {formatHour(hour)}
              </div>
              {weekDays.map((day) => {
                const dateKey = toDateKey(day);
                const dayBlocks = calendar
                  .getEventsForDate(dateKey)
                  .filter((event) => eventOverlapsHour(event, hour) && visibleCategories.includes(event.category));

                if (dayBlocks.length === 0) {
                  return (
                    <button
                      className="min-h-11 border-r border-zinc-100 bg-white p-1 text-left transition hover:bg-zinc-50"
                      key={`${dateKey}-${hour}`}
                      onClick={() => openModal(slotForHour(day.getDay(), hour))}
                      type="button"
                    />
                  );
                }

                return (
                  <div className="min-h-11 border-r border-zinc-100 bg-white p-1" key={`${dateKey}-${hour}`}>
                    <div className="space-y-1">
                      {dayBlocks.map((event) => (
                        <div
                          className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded border px-2 py-1 text-left text-[11px] font-medium leading-tight ${blockColor(event.category)}`}
                          key={`${event.id}-${hour}`}
                          onClick={() => event.sourceId && categories.includes(event.category) && openEditModal(event.sourceId)}
                          role="button"
                          tabIndex={0}
                          title={`${event.startTime} - ${event.endTime} ${event.title}`}
                        >
                          <span className="truncate">
                            {event.startTime} {event.title}
                          </span>
                          {event.sourceId && categories.includes(event.category) ? (
                            <button
                              className="shrink-0 text-[11px] underline"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                void removeBlock(event.sourceId as string);
                              }}
                              type="button"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 px-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  {editingBlockId ? "Edit" : "New"} {formatCategory(form.category)} block
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-zinc-900">
                  {form.startTime} - {form.endTime}
                </h2>
              </div>
              <button className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100" onClick={closeModal} type="button">
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Name</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  onChange={(event) => updateForm({ title: event.target.value })}
                  placeholder={placeholderForCategory(form.category)}
                  value={form.title}
                />
              </label>

              <fieldset>
                <legend className="text-sm font-medium text-zinc-800">Repeats weekly on</legend>
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {weekdayLabels.map((label, day) => {
                    const isChecked = form.daysOfWeek.includes(day);

                    return (
                      <label
                        className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-sm ${
                          isChecked ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700"
                        }`}
                        key={label}
                      >
                        <input
                          className="sr-only"
                          checked={isChecked}
                          onChange={(event) => {
                            updateForm({
                              daysOfWeek: event.target.checked
                                ? [...form.daysOfWeek, day]
                                : form.daysOfWeek.filter((selectedDay) => selectedDay !== day),
                            });
                          }}
                          type="checkbox"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">Type</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm capitalize text-zinc-900"
                    onChange={(event) => updateForm({ category: event.target.value as ScheduleCategory })}
                    value={form.category}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {formatCategory(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">Start</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                    onChange={(event) => updateForm({ startTime: event.target.value })}
                    type="time"
                    value={form.startTime}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-zinc-800">End</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                    onChange={(event) => updateForm({ endTime: event.target.value })}
                    type="time"
                    value={form.endTime}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700" onClick={closeModal} type="button">
                  Cancel
                </button>
                <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white" type="submit">
                  {editingBlockId ? "Save changes" : "Add block"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
