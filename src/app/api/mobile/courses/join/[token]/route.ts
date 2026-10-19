import { courseSharePreview } from "@personal-agent/core";
import { NextRequest, NextResponse } from "next/server";
import { resolveCourseShare } from "@/lib/courses/sharing";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { createClient } from "@/lib/supabase/server";

// Public: GET -> { preview: CourseSharePreview, ownCourseId } for an active share link, else a
// generic 404. Signed-in callers are resolved as themselves so the owner sees ownCourseId.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const auth = await getAuthenticatedRequestClient(request);
    const share = await resolveCourseShare(auth?.supabase ?? (await createClient()), token);
    if (!share) return NextResponse.json({ error: "This course link isn't active." }, { status: 404 });
    return NextResponse.json({ preview: courseSharePreview(share.template), ownCourseId: share.ownCourseId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load shared course.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
