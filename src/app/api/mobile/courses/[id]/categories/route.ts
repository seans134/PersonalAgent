import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

const CATEGORY_COLUMNS = "id, course_id, user_id, name, weight, position, created_at";

type CategoryPayload = {
  categoryId?: unknown;
  name?: unknown;
  weight?: unknown;
  position?: unknown;
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

function weightValue(value: unknown) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function positionValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function categoryId(payload: CategoryPayload) {
  return requiredText(payload.categoryId, "Category id");
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
    const payload = (await request.json()) as CategoryPayload;
    const { data, error } = await result.auth.supabase
      .from("course_categories")
      .insert({
        user_id: result.auth.user.id,
        course_id: id,
        name: requiredText(payload.name, "Category name"),
        weight: weightValue(payload.weight),
        position: positionValue(payload.position),
      })
      .select(CATEGORY_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { id } = await params;

  try {
    const payload = (await request.json()) as CategoryPayload;
    const update: Record<string, unknown> = {};
    if ("name" in payload) update.name = requiredText(payload.name, "Category name");
    if ("weight" in payload) update.weight = weightValue(payload.weight);
    if ("position" in payload) update.position = positionValue(payload.position);

    const { data, error } = await result.auth.supabase
      .from("course_categories")
      .update(update)
      .eq("id", categoryId(payload))
      .eq("user_id", result.auth.user.id)
      .eq("course_id", id)
      .select(CATEGORY_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;

  const { id } = await params;

  try {
    const payload = (await request.json()) as CategoryPayload;
    const { error } = await result.auth.supabase
      .from("course_categories")
      .delete()
      .eq("id", categoryId(payload))
      .eq("user_id", result.auth.user.id)
      .eq("course_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove category.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
