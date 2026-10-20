import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { connectLmsFeed, disconnectLmsFeed, lmsFeedErrorResponse, readLmsFeedStatus } from "@/lib/lms-feed/sync";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";

// LMS calendar feed contract, shared by web (cookie) and mobile (bearer).
// Types: packages/core/src/lms-feed/contract.ts. The feed link is write-only: responses carry
// feed.maskedUrl (host only), never the link.

export const runtime = "nodejs";

/** GET -> LmsFeedStatusResponse { feed, needsCourse }. feed is null when no feed is connected. */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await readLmsFeedStatus(auth.supabase, auth.user.id));
  } catch (error) {
    return lmsFeedErrorResponse(error, "Unable to load your LMS feed.");
  }
}

/**
 * PUT { url } -> LmsFeedSyncResponse. Connects or replaces the feed and syncs it. The link is only
 * saved when it fetches and parses; otherwise 400/422 { error, code }.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  try {
    const result = await connectLmsFeed(auth.supabase, auth.user.id, body?.url);
    revalidatePath("/courses");
    revalidatePath("/");
    return NextResponse.json(result);
  } catch (error) {
    return lmsFeedErrorResponse(error, "Unable to connect your LMS feed.");
  }
}

/** DELETE -> { ok: true }. Imported deadlines stay in their courses. */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    await disconnectLmsFeed(auth.supabase, auth.user.id);
    revalidatePath("/courses");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lmsFeedErrorResponse(error, "Unable to disconnect your LMS feed.");
  }
}
