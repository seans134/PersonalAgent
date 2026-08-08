import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { getCourseDetail } from "@/lib/courses/queries";
import { courseGradeFromRows } from "@/lib/courses/grade";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  return { auth };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  try {
    const detail = await getCourseDetail(result.auth.supabase, result.auth.user.id, id);
    if (!detail) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const grade = courseGradeFromRows(detail.categories, detail.items);
    return NextResponse.json({ ...detail, grade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load course.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if ("name" in payload) update.name = optionalText(payload.name);
    if ("code" in payload) update.code = optionalText(payload.code);
    if ("color" in payload) update.color = optionalText(payload.color);
    if ("term" in payload) update.term = optionalText(payload.term);
    if ("targetGrade" in payload) {
      const n = payload.targetGrade === null || payload.targetGrade === "" ? null : Number(payload.targetGrade);
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
        return NextResponse.json({ error: "Target grade must be between 0 and 100." }, { status: 400 });
      }
      update.target_grade = n;
    }
    if (typeof payload.archived === "boolean") {
      update.archived_at = payload.archived ? new Date().toISOString() : null;
    }
    const { data, error } = await result.auth.supabase
      .from("courses").update(update).eq("id", id).eq("user_id", result.auth.user.id)
      .select("id, user_id, name, code, color, term, target_grade, archived_at, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update course.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  const { error } = await result.auth.supabase
    .from("courses").delete().eq("id", id).eq("user_id", result.auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
