import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { joinCourseShare } from "@/lib/courses/sharing";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// Shared by the web /join/[token] page and the mobile join screen.
// POST { token } -> { courseId, created, itemCount }. created is false when the student already
// added this share (or owns the course), so a second tap never duplicates the course.
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown } | null)?.token;
  } catch {
    token = undefined;
  }

  try {
    const result = await joinCourseShare(auth.supabase, token);
    // One generic answer for unknown, malformed and stopped links.
    if (result.status === "not_found") return NextResponse.json({ error: "This course link isn't active." }, { status: 404 });
    if (result.created) {
      revalidatePath("/courses");
      revalidatePath("/");
    }
    return NextResponse.json(
      { courseId: result.courseId, created: result.created, itemCount: result.itemCount },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    // Logged server-side only; the client gets a generic message.
    console.error("[course join] Unable to add course.", error);
    return NextResponse.json({ error: "Unable to add course." }, { status: 500 });
  }
}
