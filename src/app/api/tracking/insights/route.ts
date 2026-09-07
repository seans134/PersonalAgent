import { NextRequest, NextResponse } from "next/server";
import type { HabitPeriod } from "@personal-agent/core";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { getHabitReport } from "@/lib/tracking/habit-report-request";

type InsightsRequestBody = {
  period?: unknown;
  referenceDate?: unknown;
  timezone?: unknown;
  refresh?: unknown;
};

function parsePeriod(value: unknown): HabitPeriod {
  return value === "weekly" ? "weekly" : "daily";
}

function optionalIsoDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function optionalTimezone(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as InsightsRequestBody;

  try {
    const result = await getHabitReport({
      supabase: auth.supabase,
      userId: auth.user.id,
      period: parsePeriod(body.period),
      referenceDate: optionalIsoDate(body.referenceDate),
      timezone: optionalTimezone(body.timezone),
      refresh: body.refresh === true,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ report: result.report }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build habit insights.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
