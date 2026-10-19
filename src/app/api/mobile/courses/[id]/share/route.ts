import { NextRequest, NextResponse } from "next/server";
import { CourseShareError, createCourseShare, getCourseShare, isUuid, revokeCourseShare } from "@/lib/courses/sharing";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

async function requireAuth(request: NextRequest, params: Promise<{ id: string }>) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const { id } = await params;
  if (!isUuid(id)) return { response: NextResponse.json({ error: "Course not found." }, { status: 404 }) };
  return { auth, id };
}

// Database errors are logged here, never echoed to the client.
function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CourseShareError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`[course share] ${fallback}`, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// GET -> { share: CourseShareDTO | null }: the course's active link and how many classmates joined.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request, params);
  if ("response" in result) return result.response;
  const { id } = result;
  try {
    return NextResponse.json({ share: await getCourseShare(result.auth.supabase, result.auth.user.id, id) });
  } catch (error) {
    return errorResponse(error, "Unable to load share.");
  }
}

// POST -> { share, created }: reuses the active link when there is one (201 only for a new link).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request, params);
  if ("response" in result) return result.response;
  const { id } = result;
  try {
    const { share, created } = await createCourseShare(result.auth.supabase, result.auth.user.id, id);
    return NextResponse.json({ share, created }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "Unable to share course.");
  }
}

// DELETE -> { ok: true }: stop sharing. The old link 404s; courses classmates added stay theirs.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request, params);
  if ("response" in result) return result.response;
  const { id } = result;
  try {
    await revokeCourseShare(result.auth.supabase, result.auth.user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Unable to stop sharing.");
  }
}
