import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const VALID_TASK_TYPES = new Set(["general", "focus", "fitness", "wellness", "admin"]);

type GoalPayload = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  taskType?: unknown;
  minimumDailyMinutes?: unknown;
  endDate?: unknown;
  completed?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, label: string) {
  const text = optionalText(value);

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  return text;
}

function priorityValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 3);

  if (!Number.isFinite(number)) {
    return 3;
  }

  return Math.max(1, Math.min(3, Math.round(number)));
}

function minimumDailyMinutes(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(720, Math.round(number)));
}

function taskType(value: unknown) {
  if (value === "exercise") {
    return "fitness";
  }

  if (value === "wellbeing") {
    return "wellness";
  }

  return typeof value === "string" && VALID_TASK_TYPES.has(value) ? value : "general";
}

function endDate(value: unknown) {
  const text = optionalText(value);

  if (!text) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("End date must be YYYY-MM-DD.");
  }

  return text;
}

function goalId(payload: GoalPayload) {
  return requiredText(payload.id, "Goal id");
}

function goalInput(payload: GoalPayload) {
  return {
    title: requiredText(payload.title, "Goal title"),
    description: optionalText(payload.description),
    priority: priorityValue(payload.priority),
    task_type: taskType(payload.taskType),
    minimum_daily_minutes: minimumDailyMinutes(payload.minimumDailyMinutes),
    end_date: endDate(payload.endDate),
  };
}

async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { data, error } = await result.auth.supabase
    .from("goals")
    .select("id, title, description, priority, task_type, minimum_daily_minutes, end_date, completed_at, created_at")
    .eq("user_id", result.auth.user.id)
    .order("completed_at", { ascending: false, nullsFirst: true })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const goals = data ?? [];

  return NextResponse.json({
    activeGoals: goals.filter((goal) => !goal.completed_at),
    completedGoals: goals.filter((goal) => goal.completed_at),
  });
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as GoalPayload;
    const { data, error } = await result.auth.supabase
      .from("goals")
      .insert({
        user_id: result.auth.user.id,
        ...goalInput(payload),
      })
      .select("id, title, description, priority, task_type, minimum_daily_minutes, end_date, completed_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ goal: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create goal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as GoalPayload;
    const update =
      typeof payload.completed === "boolean"
        ? { completed_at: payload.completed ? new Date().toISOString() : null }
        : goalInput(payload);

    const { data, error } = await result.auth.supabase
      .from("goals")
      .update(update)
      .eq("id", goalId(payload))
      .eq("user_id", result.auth.user.id)
      .select("id, title, description, priority, task_type, minimum_daily_minutes, end_date, completed_at, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ goal: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update goal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  try {
    const payload = (await request.json()) as GoalPayload;
    const { error } = await result.auth.supabase
      .from("goals")
      .delete()
      .eq("id", goalId(payload))
      .eq("user_id", result.auth.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove goal.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
