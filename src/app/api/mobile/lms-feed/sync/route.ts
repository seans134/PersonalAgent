import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { lmsFeedErrorResponse, syncLmsFeed } from "@/lib/lms-feed/sync";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

export const runtime = "nodejs";

/**
 * POST { ifStale? } -> LmsFeedSyncResponse. "Sync now" sends {}; opening Courses sends
 * { ifStale: true }, which returns synced: false unless the last sync is over 12 hours old.
 * 404 when no feed is connected, 429 when the last attempt was under a minute ago, 422 { error, code }
 * when the feed can't be fetched or read.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }
  }
  const ifStale = Boolean(body && typeof body === "object" && (body as { ifStale?: unknown }).ifStale === true);

  try {
    const result = await syncLmsFeed(auth.supabase, auth.user.id, { ifStale });
    if (result.synced && result.counts && (result.counts.added > 0 || result.counts.updated > 0)) {
      revalidatePath("/courses");
      revalidatePath("/");
    }
    return NextResponse.json(result);
  } catch (error) {
    return lmsFeedErrorResponse(error, "Unable to sync your LMS feed.");
  }
}
