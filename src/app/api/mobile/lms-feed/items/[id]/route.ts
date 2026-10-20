import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { parseLmsPendingItemAction } from "@personal-agent/core/lms-feed";
import { lmsFeedErrorResponse, resolvePendingLmsItem } from "@/lib/lms-feed/sync";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH { action: "assign", courseId, kind? } | { action: "skip" } -> LmsFeedStatusResponse.
 * Resolves a feed deadline that didn't match a course. 404 when it was already handled.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "That deadline was already handled." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = parseLmsPendingItemAction(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await resolvePendingLmsItem(auth.supabase, auth.user.id, id, parsed.value);
    if (parsed.value.action === "assign") {
      revalidatePath("/courses");
      revalidatePath("/");
    }
    return NextResponse.json(result);
  } catch (error) {
    return lmsFeedErrorResponse(error, "Unable to update that deadline.");
  }
}
