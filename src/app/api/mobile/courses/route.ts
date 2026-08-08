import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { listCourseSummaries } from "@/lib/courses/queries";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function requiredText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}
function optionalPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Target grade must be between 0 and 100.");
  return n;
}
async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  try {
    const courses = await listCourseSummaries(result.auth.supabase, result.auth.user.id, { includeArchived });
    return NextResponse.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load courses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const { data, error } = await result.auth.supabase
      .from("courses")
      .insert({
        user_id: result.auth.user.id,
        name: requiredText(payload.name, "Course name"),
        code: optionalText(payload.code),
        color: optionalText(payload.color),
        term: optionalText(payload.term),
        target_grade: optionalPercent(payload.targetGrade),
      })
      .select("id, user_id, name, code, color, term, target_grade, archived_at, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create course.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
