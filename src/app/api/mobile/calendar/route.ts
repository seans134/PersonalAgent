import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

type CalendarEventRow = {
  id: string;
  title: string;
  category: "school" | "work" | "study" | "personal" | "unavailable";
  event_date: string;
  start_time: string;
  end_time: string;
};

type ScheduleBlockRow = {
  id: string;
  title: string;
  category: "school" | "work" | "study" | "personal" | "unavailable";
  days_of_week: number[];
  start_time: string;
  end_time: string;
  timezone: string | null;
};

type UserProfileCalendarRow = {
  has_school_schedule: boolean | null;
  has_work_schedule: boolean | null;
};

const CALENDAR_CATEGORIES = new Set(["school", "work", "study", "personal", "unavailable"]);

type CalendarMutationPayload = {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  category?: unknown;
  date?: unknown;
  daysOfWeek?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  timezone?: unknown;
};

function normalizeDbTime(value: string) {
  return value.slice(0, 5);
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function calendarKind(value: unknown) {
  if (value !== "event" && value !== "block") throw new Error("Calendar item kind must be event or block.");
  return value;
}

function category(value: unknown) {
  return typeof value === "string" && CALENDAR_CATEGORIES.has(value) ? value : "personal";
}

function time(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`${label} must use HH:MM format.`);
  return text;
}

function timeRange(payload: CalendarMutationPayload) {
  const startTime = time(payload.startTime, "Start time");
  const endTime = time(payload.endTime, "End time");
  if (endTime <= startTime) throw new Error("End time must be after start time.");
  return { startTime, endTime };
}

function eventDate(value: unknown) {
  const text = requiredText(value, "Event date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
    throw new Error("Event date must use YYYY-MM-DD format.");
  }
  return text;
}

function weekdays(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Choose at least one weekday.");
  const days = [...new Set(value.map(Number))].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort();
  if (days.length === 0) throw new Error("Choose at least one weekday.");
  return days;
}

function toEvent(event: CalendarEventRow) {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    date: event.event_date,
    startTime: normalizeDbTime(event.start_time),
    endTime: normalizeDbTime(event.end_time),
    source: "manual" as const,
  };
}

function toBlock(block: ScheduleBlockRow) {
  return {
    id: block.id,
    title: block.title,
    category: block.category,
    daysOfWeek: block.days_of_week,
    startTime: normalizeDbTime(block.start_time),
    endTime: normalizeDbTime(block.end_time),
    timezone: block.timezone ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const [profileResult, eventsResult, blocksResult] = await Promise.all([
    auth.supabase
      .from("user_profiles")
      .select("has_school_schedule, has_work_schedule")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    auth.supabase
      .from("calendar_events")
      .select("id, title, category, event_date, start_time, end_time")
      .eq("user_id", auth.user.id)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true }),
    auth.supabase
      .from("schedule_blocks")
      .select("id, title, category, days_of_week, start_time, end_time, timezone")
      .eq("user_id", auth.user.id)
      .order("start_time", { ascending: true }),
  ]);

  if (profileResult.error || eventsResult.error || blocksResult.error) {
    return NextResponse.json(
      {
        error:
          profileResult.error?.message ??
          eventsResult.error?.message ??
          blocksResult.error?.message ??
          "Unable to load calendar.",
      },
      { status: 500 },
    );
  }

  const profile = profileResult.data as UserProfileCalendarRow | null;
  const events = ((eventsResult.data ?? []) as CalendarEventRow[]).map(toEvent);
  const scheduleBlocks = ((blocksResult.data ?? []) as ScheduleBlockRow[]).map(toBlock);

  return NextResponse.json({
    visibility: {
      school: Boolean(profile?.has_school_schedule),
      work: Boolean(profile?.has_work_schedule),
      study: true,
      personal: true,
      unavailable: true,
    },
    scheduleBlocks,
    events,
  });
}

async function saveCalendarItem(request: NextRequest, update: boolean) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const payload = (await request.json()) as CalendarMutationPayload;
    const kind = calendarKind(payload.kind);
    const title = requiredText(payload.title, "Title");
    const itemCategory = category(payload.category);
    const { startTime, endTime } = timeRange(payload);
    const id = update ? requiredText(payload.id, "Calendar item id") : null;

    if (kind === "event") {
      const values = {
        user_id: auth.user.id,
        title,
        category: itemCategory,
        event_date: eventDate(payload.date),
        start_time: startTime,
        end_time: endTime,
      };
      const query = update
        ? auth.supabase.from("calendar_events").update(values).eq("id", id).eq("user_id", auth.user.id)
        : auth.supabase.from("calendar_events").insert(values);
      const { data, error } = await query
        .select("id, title, category, event_date, start_time, end_time")
        .single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Unable to save event." }, { status: 500 });
      return NextResponse.json({ event: toEvent(data as CalendarEventRow) }, { status: update ? 200 : 201 });
    }

    const values = {
      user_id: auth.user.id,
      title,
      category: itemCategory,
      days_of_week: weekdays(payload.daysOfWeek),
      start_time: startTime,
      end_time: endTime,
      timezone: typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone.trim() : "America/Toronto",
    };
    const query = update
      ? auth.supabase.from("schedule_blocks").update(values).eq("id", id).eq("user_id", auth.user.id)
      : auth.supabase.from("schedule_blocks").insert(values);
    const { data, error } = await query
      .select("id, title, category, days_of_week, start_time, end_time, timezone")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Unable to save schedule block." }, { status: 500 });

    if (itemCategory === "school" || itemCategory === "work") {
      await auth.supabase.from("user_profiles").upsert(
        {
          user_id: auth.user.id,
          ...(itemCategory === "school" ? { has_school_schedule: true } : {}),
          ...(itemCategory === "work" ? { has_work_schedule: true } : {}),
        },
        { onConflict: "user_id" },
      );
    }

    return NextResponse.json({ scheduleBlock: toBlock(data as ScheduleBlockRow) }, { status: update ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save calendar item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  return saveCalendarItem(request, false);
}

export async function PATCH(request: NextRequest) {
  return saveCalendarItem(request, true);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const payload = (await request.json()) as CalendarMutationPayload;
    const kind = calendarKind(payload.kind);
    const id = requiredText(payload.id, "Calendar item id");
    const table = kind === "event" ? "calendar_events" : "schedule_blocks";
    const { error } = await auth.supabase.from(table).delete().eq("id", id).eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove calendar item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
