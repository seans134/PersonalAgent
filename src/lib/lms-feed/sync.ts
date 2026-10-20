import { NextResponse } from "next/server";
import {
  detectLmsProvider,
  ICAL_MAX_EVENTS,
  isLmsFeedErrorCode,
  isLmsFeedStale,
  LMS_FEED_MIN_SYNC_INTERVAL_MS,
  lmsDeadlinesFromEvents,
  lmsFeedErrorMessage,
  lmsFeedHost,
  maskLmsFeedUrl,
  normalizeLmsFeedUrl,
  parseICalendar,
  planLmsFeedSync,
  type LmsCourseRef,
  type LmsDeadline,
  type LmsFeedErrorCode,
  type LmsFeedItemRecord,
  type LmsFeedStatusResponse,
  type LmsFeedSummary,
  type LmsFeedSyncCounts,
  type LmsFeedSyncResponse,
  type LmsPendingItem,
  type LmsPendingItemAction,
} from "@personal-agent/core/lms-feed";
import { profileTimezoneForUser } from "@/lib/planner/checkoff-store";
import type { createClient } from "@/lib/supabase/server";
import { fetchLmsFeed, LmsFeedFetchError } from "./fetch-feed";

// LMS calendar feed sync for /api/mobile/lms-feed/* (web uses the same routes with cookie auth).
// Parsing, matching and the re-sync plan are pure (packages/core/src/lms-feed); this file fetches
// the feed and reads and writes lms_feeds, lms_feed_items and course_items.
//
// The feed link is a credential: it is read from lms_feeds only to fetch, and never returned,
// logged, or put in an error message (LmsFeedError messages are fixed copy).

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** A failure the routes answer with `status` and the message (and `code` for feed problems). */
export class LmsFeedError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: LmsFeedErrorCode | null = null,
  ) {
    super(message);
  }
}

export type LmsFeedDeps = {
  fetchFeed?: (url: string) => Promise<string>;
  now?: () => Date;
};

/** Auto-sync (ifStale) waits this long after a failed attempt before trying again. */
const AUTO_RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
const PENDING_LIMIT = 200;
const PAGE = 1000;
const CHUNK = 200;

type FeedRow = {
  /** Null before the first successful connect and after a disconnect. */
  feed_url: string | null;
  last_synced_at: string | null;
  last_counts: LmsFeedSyncCounts | null;
  last_attempt_at: string | null;
  last_error: string | null;
};

type ItemRow = {
  id: string;
  uid: string;
  status: LmsFeedItemRecord["status"];
  course_item_id: string | null;
  course_id: string | null;
  kind: LmsFeedItemRecord["kind"];
  title: string;
  due_at: string;
  end_at: string | null;
  course_hint: string | null;
};

const FEED_COLUMNS = "feed_url, last_synced_at, last_counts, last_attempt_at, last_error";
const ITEM_COLUMNS = "id, uid, status, course_item_id, course_id, kind, title, due_at, end_at, course_hint";

function toRecord(row: ItemRow): LmsFeedItemRecord {
  return {
    id: row.id,
    uid: row.uid,
    status: row.status,
    courseItemId: row.course_item_id,
    courseId: row.course_id,
    kind: row.kind,
    title: row.title,
    dueAt: row.due_at,
    endAt: row.end_at,
    courseHint: row.course_hint,
  };
}

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Database errors keep their message out of responses (it could quote values); routes show fixed copy. */
function dbError(action: string): LmsFeedError {
  return new LmsFeedError(500, `Unable to ${action}.`);
}

function toSummary(row: FeedRow & { feed_url: string }, now: Date): LmsFeedSummary {
  const host = lmsFeedHost(row.feed_url);
  const lastError = isLmsFeedErrorCode(row.last_error) ? row.last_error : null;
  return {
    maskedUrl: maskLmsFeedUrl(row.feed_url),
    host,
    provider: detectLmsProvider(host),
    lastSyncedAt: row.last_synced_at,
    lastAttemptAt: row.last_attempt_at,
    lastError,
    lastErrorMessage: lastError ? lmsFeedErrorMessage(lastError) : null,
    counts: row.last_counts && typeof row.last_counts === "object" ? row.last_counts : null,
    stale: isLmsFeedStale(row.last_synced_at, now),
  };
}

async function readFeedRow(supabase: SupabaseClient, userId: string): Promise<FeedRow | null> {
  const { data, error } = await supabase.from("lms_feeds").select(FEED_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw dbError("load your LMS feed");
  return (data as FeedRow | null) ?? null;
}

async function readPending(supabase: SupabaseClient, userId: string): Promise<LmsPendingItem[]> {
  const { data, error } = await supabase
    .from("lms_feed_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "needs_course")
    .order("due_at", { ascending: true })
    .limit(PENDING_LIMIT);
  if (error) throw dbError("load LMS deadlines");
  return ((data ?? []) as ItemRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    dueAt: row.due_at,
    endAt: row.end_at,
    courseHint: row.course_hint,
  }));
}

async function readAllRecords(supabase: SupabaseClient, userId: string): Promise<LmsFeedItemRecord[]> {
  const records: LmsFeedItemRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("lms_feed_items")
      .select(ITEM_COLUMNS)
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw dbError("load LMS deadlines");
    const rows = (data ?? []) as ItemRow[];
    records.push(...rows.map(toRecord));
    if (rows.length < PAGE) return records;
  }
}

async function readCourses(supabase: SupabaseClient, userId: string): Promise<LmsCourseRef[]> {
  const { data, error } = await supabase.from("courses").select("id, name, code").eq("user_id", userId).is("archived_at", null);
  if (error) throw dbError("load your courses");
  return (data ?? []) as LmsCourseRef[];
}

export async function readLmsFeedStatus(supabase: SupabaseClient, userId: string, deps: LmsFeedDeps = {}): Promise<LmsFeedStatusResponse> {
  const now = deps.now?.() ?? new Date();
  const row = await readFeedRow(supabase, userId);
  if (!row?.feed_url) return { feed: null, needsCourse: [] };
  return { feed: toSummary({ ...row, feed_url: row.feed_url }, now), needsCourse: await readPending(supabase, userId) };
}

/** Fetches and parses; any failure is an LmsFeedError with fixed copy (never the link). */
async function loadFeed(url: string, deps: LmsFeedDeps): Promise<ReturnType<typeof parseICalendar>> {
  let text: string;
  try {
    text = await (deps.fetchFeed ?? fetchLmsFeed)(url);
  } catch (error) {
    const code: LmsFeedErrorCode = error instanceof LmsFeedFetchError ? error.code : "unreachable";
    throw new LmsFeedError(422, lmsFeedErrorMessage(code), code);
  }
  const parsed = parseICalendar(text, { maxEvents: ICAL_MAX_EVENTS });
  if (!parsed.isCalendar) throw new LmsFeedError(422, lmsFeedErrorMessage("not_calendar"), "not_calendar");
  if (parsed.truncated) throw new LmsFeedError(422, lmsFeedErrorMessage("too_many_events"), "too_many_events");
  return parsed;
}

type ItemRowInput = Omit<ItemRow, "id"> & { user_id: string };

function rowFromDeadline(
  userId: string,
  deadline: LmsDeadline,
  base: Pick<ItemRow, "status" | "course_item_id" | "course_id">,
): ItemRowInput {
  return {
    user_id: userId,
    uid: deadline.uid,
    status: base.status,
    course_item_id: base.course_item_id,
    course_id: base.course_id,
    kind: deadline.kind,
    title: deadline.title,
    due_at: deadline.dueAt,
    end_at: deadline.endAt,
    course_hint: deadline.courseHint,
  };
}

/** Applies the sync plan for a parsed feed and returns its counts. */
async function applyFeed(
  supabase: SupabaseClient,
  userId: string,
  parsed: ReturnType<typeof parseICalendar>,
  now: Date,
): Promise<LmsFeedSyncCounts> {
  const timezone = await profileTimezoneForUser(supabase, userId).catch(() => "America/Toronto");
  const deadlines = lmsDeadlinesFromEvents(parsed.events, { student: timezone, calendar: parsed.calendarTimezone });
  const [records, courses] = await Promise.all([readAllRecords(supabase, userId), readCourses(supabase, userId)]);
  const plan = planLmsFeedSync({ deadlines, records, courses, now, eventCount: parsed.events.length });
  const recordById = new Map(records.map((record) => [record.id, record] as const));

  // 1) New course items, with ids chosen here so the mapping rows can point at them.
  const created = plan.create.map((entry) => ({ ...entry, itemId: crypto.randomUUID() }));

  // 2) Mapping rows. Events seen for the first time are inserted (by user + UID); rows read above are
  //    updated one by one, only while their status is still the one this sync read, so an assign or
  //    skip the student makes during the sync (PATCH .../items/:id) is never overwritten.
  const inserts: ItemRowInput[] = [];
  const updates: Array<{ record: LmsFeedItemRecord; row: ItemRowInput; itemId: string | null }> = [];
  for (const { deadline, courseId, itemId, recordId } of created) {
    const row = rowFromDeadline(userId, deadline, { status: "imported", course_item_id: itemId, course_id: courseId });
    const record = recordId ? recordById.get(recordId) : undefined;
    if (record) updates.push({ record, row, itemId });
    else inserts.push(row);
  }
  for (const deadline of plan.addNeedsCourse) {
    inserts.push(rowFromDeadline(userId, deadline, { status: "needs_course", course_item_id: null, course_id: null }));
  }
  const removed = new Set(plan.markRemoved);
  const updatedIds = new Set(updates.map((update) => update.record.id));
  for (const { recordId, deadline } of plan.refresh) {
    const record = recordById.get(recordId);
    if (!record || updatedIds.has(recordId)) continue;
    updatedIds.add(recordId);
    updates.push({
      record,
      itemId: null,
      row: rowFromDeadline(userId, deadline, {
        status: removed.has(recordId) ? "removed" : record.status,
        course_item_id: record.courseItemId,
        course_id: record.courseId,
      }),
    });
  }
  const markOnly = plan.markRemoved.filter((id) => !updatedIds.has(id));

  // New items whose waiting row the student resolved mid-sync: delete them (nothing maps to them).
  const orphaned: string[] = [];
  try {
    for (const batch of chunks(created)) {
      const { error } = await supabase.from("course_items").insert(
        batch.map(({ deadline, courseId, itemId }) => ({
          id: itemId,
          user_id: userId,
          course_id: courseId,
          kind: deadline.kind,
          title: deadline.title,
          due_at: deadline.dueAt,
          end_at: deadline.endAt,
        })),
      );
      if (error) throw dbError("add LMS deadlines");
    }
    for (const batch of chunks(inserts)) {
      const { error } = await supabase
        .from("lms_feed_items")
        .upsert(batch, { onConflict: "user_id,uid", ignoreDuplicates: true });
      if (error) throw dbError("save LMS deadlines");
    }
    for (const batch of chunks(updates, 10)) {
      const results = await Promise.all(
        batch.map(({ record, row }) => {
          // uid and user_id are the row's identity; don't rewrite them.
          const patch: Partial<ItemRowInput> = { ...row };
          delete patch.uid;
          delete patch.user_id;
          return supabase
            .from("lms_feed_items")
            .update(patch)
            .eq("user_id", userId)
            .eq("id", record.id)
            .eq("status", record.status)
            .select("id");
        }),
      );
      results.forEach((result, index) => {
        if (result.error) throw dbError("save LMS deadlines");
        const { itemId } = batch[index];
        if (itemId && ((result.data ?? []) as unknown[]).length === 0) orphaned.push(itemId);
      });
    }
  } catch (error) {
    // Take the new items back out so the next sync doesn't duplicate them. Mapping rows that already
    // point at them go first: deleting a mapped item would mark its row removed (trigger), and the
    // deadline would then never be imported again.
    const ids = created.map((entry) => entry.itemId);
    for (const batch of chunks(ids)) {
      await supabase.from("lms_feed_items").delete().eq("user_id", userId).in("course_item_id", batch);
      await supabase.from("course_items").delete().eq("user_id", userId).in("id", batch);
    }
    throw error;
  }
  for (const batch of chunks(orphaned)) {
    const { error } = await supabase.from("course_items").delete().eq("user_id", userId).in("id", batch);
    if (error) throw dbError("save LMS deadlines");
  }

  for (const batch of chunks(markOnly)) {
    const { error } = await supabase
      .from("lms_feed_items")
      .update({ status: "removed" })
      .eq("user_id", userId)
      .eq("status", "imported")
      .is("course_item_id", null)
      .in("id", batch);
    if (error) throw dbError("save LMS deadlines");
  }

  // 3) Course items whose date or title changed in the LMS.
  for (const batch of chunks(plan.updateItems, 10)) {
    const results = await Promise.all(
      batch.map(({ courseItemId, patch }) =>
        supabase.from("course_items").update(patch).eq("user_id", userId).eq("id", courseItemId),
      ),
    );
    if (results.some((result) => result.error)) throw dbError("update LMS deadlines");
  }

  // 4) Waiting events that left the feed or the import window.
  for (const batch of chunks(plan.dropNeedsCourse)) {
    const { error } = await supabase
      .from("lms_feed_items")
      .delete()
      .eq("user_id", userId)
      .eq("status", "needs_course")
      .in("id", batch);
    if (error) throw dbError("save LMS deadlines");
  }

  return { ...plan.counts, added: plan.counts.added - orphaned.length };
}

async function recordFailure(supabase: SupabaseClient, userId: string, code: LmsFeedErrorCode | null) {
  // Best effort: the student still gets the error even if this write fails. Failures that aren't
  // about the feed itself (database errors) are saved as "internal".
  await supabase.from("lms_feeds").update({ last_error: code ?? "internal", updated_at: new Date().toISOString() }).eq("user_id", userId);
}

async function recordSuccess(supabase: SupabaseClient, userId: string, counts: LmsFeedSyncCounts, now: Date) {
  const { error } = await supabase
    .from("lms_feeds")
    .update({ last_synced_at: now.toISOString(), last_counts: counts, last_error: null, updated_at: now.toISOString() })
    .eq("user_id", userId);
  if (error) throw dbError("save the sync time");
}

const THROTTLED_MESSAGE = "Atlas just checked your feed. Try again in a minute.";

/**
 * Claims a sync attempt: sets last_attempt_at only when the last attempt is over a minute old.
 * The conditional update is atomic, so of two concurrent connects/syncs only one gets the row
 * (the other gets null). Connect and sync share this, so neither can run unthrottled or in parallel.
 */
async function claimAttempt(supabase: SupabaseClient, userId: string, now: Date): Promise<{ feed_url: string | null } | null> {
  const cutoff = new Date(now.getTime() - LMS_FEED_MIN_SYNC_INTERVAL_MS).toISOString();
  const { data, error } = await supabase
    .from("lms_feeds")
    .update({ last_attempt_at: now.toISOString() })
    .eq("user_id", userId)
    .or(`last_attempt_at.is.null,last_attempt_at.lt."${cutoff}"`)
    .select("feed_url");
  if (error) throw dbError("sync your LMS feed");
  return ((data ?? []) as Array<{ feed_url: string | null }>)[0] ?? null;
}

/**
 * Connects (or replaces) the student's feed link. A first connect creates the student's lms_feeds
 * row without a link (insert, ignoring an existing row) so the attempt can be claimed like a sync.
 * The feed is then fetched and parsed, and the link is saved only once that works: a failing link
 * is never stored, and a failed replacement keeps the old link. Earlier lms_feed_items stay, so
 * reconnecting the same LMS (even with a reset token) doesn't duplicate anything.
 */
export async function connectLmsFeed(
  supabase: SupabaseClient,
  userId: string,
  rawUrl: unknown,
  deps: LmsFeedDeps = {},
): Promise<LmsFeedSyncResponse> {
  const now = deps.now?.() ?? new Date();
  const normalized = normalizeLmsFeedUrl(rawUrl);
  if (!normalized.ok) throw new LmsFeedError(400, lmsFeedErrorMessage("invalid_url"), "invalid_url");

  const { error: ensureError } = await supabase
    .from("lms_feeds")
    .upsert({ user_id: userId, feed_url: null, last_attempt_at: null }, { onConflict: "user_id", ignoreDuplicates: true });
  if (ensureError) throw dbError("save your LMS feed");
  if (!(await claimAttempt(supabase, userId, now))) throw new LmsFeedError(429, THROTTLED_MESSAGE);

  const parsed = await loadFeed(normalized.url, deps);

  const { error } = await supabase
    .from("lms_feeds")
    .update({ feed_url: normalized.url, last_error: null, updated_at: now.toISOString() })
    .eq("user_id", userId);
  if (error) throw dbError("save your LMS feed");

  let counts: LmsFeedSyncCounts;
  try {
    counts = await applyFeed(supabase, userId, parsed, now);
  } catch (applyError) {
    await recordFailure(supabase, userId, applyError instanceof LmsFeedError ? applyError.code : null).catch(() => undefined);
    throw applyError;
  }
  await recordSuccess(supabase, userId, counts, now);
  return { ...(await readLmsFeedStatus(supabase, userId, { now: () => now })), synced: true, counts };
}

/**
 * Syncs the saved feed. With ifStale, does nothing (synced: false) unless the last successful sync
 * is over 12 hours old and no attempt failed in the last hour. Attempts are at least a minute apart;
 * claiming last_attempt_at also keeps two devices from syncing at once.
 */
export async function syncLmsFeed(
  supabase: SupabaseClient,
  userId: string,
  options: { ifStale?: boolean } = {},
  deps: LmsFeedDeps = {},
): Promise<LmsFeedSyncResponse> {
  const now = deps.now?.() ?? new Date();
  const row = await readFeedRow(supabase, userId);
  if (!row?.feed_url) throw new LmsFeedError(404, "Connect your LMS calendar feed first.");

  const lastAttempt = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : 0;
  if (options.ifStale) {
    const failedRecently = Boolean(row.last_error) && now.getTime() - lastAttempt < AUTO_RETRY_AFTER_FAILURE_MS;
    const busy = now.getTime() - lastAttempt < LMS_FEED_MIN_SYNC_INTERVAL_MS;
    if (!isLmsFeedStale(row.last_synced_at, now) || failedRecently || busy) {
      return { ...(await readLmsFeedStatus(supabase, userId, { now: () => now })), synced: false, counts: null };
    }
  }

  const claimed = await claimAttempt(supabase, userId, now);
  if (!claimed?.feed_url) {
    if (options.ifStale) return { ...(await readLmsFeedStatus(supabase, userId, { now: () => now })), synced: false, counts: null };
    if (claimed) throw new LmsFeedError(404, "Connect your LMS calendar feed first.");
    throw new LmsFeedError(429, THROTTLED_MESSAGE);
  }

  let counts: LmsFeedSyncCounts;
  try {
    const parsed = await loadFeed(claimed.feed_url, deps);
    counts = await applyFeed(supabase, userId, parsed, now);
  } catch (error) {
    await recordFailure(supabase, userId, error instanceof LmsFeedError ? error.code : null).catch(() => undefined);
    throw error;
  }
  await recordSuccess(supabase, userId, counts, now);
  return { ...(await readLmsFeedStatus(supabase, userId, { now: () => now })), synced: true, counts };
}

/**
 * Disconnects the feed: the link, sync times and counts are cleared and waiting events are
 * forgotten. The row itself stays with its last_attempt_at, so disconnecting doesn't reset the
 * one-minute throttle. Imported course items stay (they're the student's now), and so do their
 * mapping rows, so reconnecting doesn't duplicate them.
 */
export async function disconnectLmsFeed(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("lms_feeds")
    .update({ feed_url: null, last_synced_at: null, last_counts: null, last_error: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw dbError("disconnect your LMS feed");
  const { error: pendingError } = await supabase.from("lms_feed_items").delete().eq("user_id", userId).eq("status", "needs_course");
  if (pendingError) throw dbError("disconnect your LMS feed");
}

/** Puts a waiting event into a course (creating the course item) or skips it for good. */
export async function resolvePendingLmsItem(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  action: LmsPendingItemAction,
  deps: LmsFeedDeps = {},
): Promise<LmsFeedStatusResponse> {
  const { data, error } = await supabase
    .from("lms_feed_items")
    .select(ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "needs_course")
    .maybeSingle();
  if (error) throw dbError("load that deadline");
  const row = data as ItemRow | null;
  if (!row) throw new LmsFeedError(404, "That deadline was already handled.");

  if (action.action === "skip") {
    const { error: skipError } = await supabase
      .from("lms_feed_items")
      .update({ status: "skipped" })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("status", "needs_course");
    if (skipError) throw dbError("skip that deadline");
    return readLmsFeedStatus(supabase, userId, deps);
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id")
    .eq("user_id", userId)
    .eq("id", action.courseId)
    .maybeSingle();
  if (courseError) throw dbError("load that course");
  if (!course) throw new LmsFeedError(404, "Course not found.");

  const itemId = crypto.randomUUID();
  const { error: itemError } = await supabase.from("course_items").insert({
    id: itemId,
    user_id: userId,
    course_id: action.courseId,
    kind: action.kind ?? row.kind,
    title: row.title,
    due_at: row.due_at,
    end_at: row.end_at,
  });
  if (itemError) throw dbError("add that deadline");

  const { data: updated, error: updateError } = await supabase
    .from("lms_feed_items")
    .update({ status: "imported", course_item_id: itemId, course_id: action.courseId })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "needs_course")
    .select("id");
  if (updateError || !updated || (updated as unknown[]).length === 0) {
    // Another device handled it first (or the write failed); don't leave a duplicate item behind.
    await supabase.from("course_items").delete().eq("user_id", userId).eq("id", itemId);
    if (updateError) throw dbError("add that deadline");
    throw new LmsFeedError(409, "That deadline was already handled.");
  }
  return readLmsFeedStatus(supabase, userId, deps);
}

/**
 * Route error response. Unexpected errors get the fallback copy only: their message could come
 * from a library that echoed the request, and the feed link must never reach a client or a log.
 */
export function lmsFeedErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof LmsFeedError) {
    return NextResponse.json(error.code ? { error: error.message, code: error.code } : { error: error.message }, {
      status: error.status,
    });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
