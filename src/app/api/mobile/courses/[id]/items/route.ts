import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const ITEM_COLUMNS =
  "id, course_id, category_id, user_id, kind, title, due_at, end_at, location, score_earned, score_max, estimated_effort_hours, focus_mode, created_at";

const KINDS = new Set(["assignment", "quiz", "exam"]);
const MODES = new Set(["finish_first", "continuous", "deferred"]);

function parseKind(v: unknown) {
  if (typeof v === "string" && KINDS.has(v)) return v;
  throw new Error("Invalid kind.");
}

function parseMode(v: unknown) {
  return typeof v === "string" && MODES.has(v) ? v : "continuous";
}

function parseIsoRequired(v: unknown, label: string) {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
    throw new Error(`${label} must be a valid date.`);
  }
  return v;
}

function parseNonNegOrNull(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("Value must be zero or greater.");
  return n;
}

function parseScoreMax(v: unknown) {
  const n = Number(v ?? 100);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

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

type ItemPayload = {
  itemId?: unknown;
  kind?: unknown;
  title?: unknown;
  categoryId?: unknown;
  dueAt?: unknown;
  endAt?: unknown;
  location?: unknown;
  scoreMax?: unknown;
  scoreEarned?: unknown;
  estimatedEffortHours?: unknown;
  focusMode?: unknown;
};

function itemId(payload: ItemPayload) {
  return requiredText(payload.itemId, "Item id");
}

async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);

  if (!auth) {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  }

  return { auth };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { id } = await params;

  try {
    const { data: course, error: ownershipError } = await result.auth.supabase
      .from("courses").select("id").eq("id", id).eq("user_id", result.auth.user.id).maybeSingle();
    if (ownershipError) return NextResponse.json({ error: ownershipError.message }, { status: 500 });
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const payload = (await request.json()) as ItemPayload;
    const { data, error } = await result.auth.supabase
      .from("course_items")
      .insert({
        user_id: result.auth.user.id,
        course_id: id,
        category_id: optionalText(payload.categoryId),
        kind: parseKind(payload.kind),
        title: requiredText(payload.title, "Title"),
        due_at: parseIsoRequired(payload.dueAt, "Due date"),
        end_at: payload.endAt ? parseIsoRequired(payload.endAt, "End date") : null,
        location: optionalText(payload.location),
        score_max: parseScoreMax(payload.scoreMax),
        estimated_effort_hours: parseNonNegOrNull(payload.estimatedEffortHours),
        focus_mode: parseMode(payload.focusMode),
      })
      .select(ITEM_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { id } = await params;

  try {
    const payload = (await request.json()) as ItemPayload;
    const update: Record<string, unknown> = {};
    if ("kind" in payload) update.kind = parseKind(payload.kind);
    if ("title" in payload) update.title = requiredText(payload.title, "Title");
    if ("categoryId" in payload) update.category_id = optionalText(payload.categoryId);
    if ("dueAt" in payload) update.due_at = parseIsoRequired(payload.dueAt, "Due date");
    if ("endAt" in payload) update.end_at = payload.endAt ? parseIsoRequired(payload.endAt, "End date") : null;
    if ("location" in payload) update.location = optionalText(payload.location);
    if ("scoreMax" in payload) update.score_max = parseScoreMax(payload.scoreMax);
    if ("scoreEarned" in payload) update.score_earned = parseNonNegOrNull(payload.scoreEarned);
    if ("estimatedEffortHours" in payload) update.estimated_effort_hours = parseNonNegOrNull(payload.estimatedEffortHours);
    if ("focusMode" in payload) update.focus_mode = parseMode(payload.focusMode);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data, error } = await result.auth.supabase
      .from("course_items")
      .update(update)
      .eq("id", itemId(payload))
      .eq("user_id", result.auth.user.id)
      .eq("course_id", id)
      .select(ITEM_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { id } = await params;

  try {
    const payload = (await request.json()) as ItemPayload;
    const { error } = await result.auth.supabase
      .from("course_items")
      .delete()
      .eq("id", itemId(payload))
      .eq("user_id", result.auth.user.id)
      .eq("course_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
