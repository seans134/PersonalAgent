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

function normalizeDbTime(value: string) {
  return value.slice(0, 5);
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
  const events = ((eventsResult.data ?? []) as CalendarEventRow[]).map((event) => ({
    id: event.id,
    title: event.title,
    category: event.category,
    date: event.event_date,
    startTime: normalizeDbTime(event.start_time),
    endTime: normalizeDbTime(event.end_time),
    source: "manual" as const,
  }));
  const scheduleBlocks = ((blocksResult.data ?? []) as ScheduleBlockRow[]).map((block) => ({
    id: block.id,
    title: block.title,
    category: block.category,
    daysOfWeek: block.days_of_week,
    startTime: normalizeDbTime(block.start_time),
    endTime: normalizeDbTime(block.end_time),
    timezone: block.timezone ?? undefined,
  }));

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
