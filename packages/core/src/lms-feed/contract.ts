// Request/response contract for /api/mobile/lms-feed/*, shared by web (cookie auth) and mobile
// (bearer). The feed link itself is never in a response: clients get maskedUrl and host only.

import type { LmsDeadlineKind, LmsFeedSyncCounts } from "./deadlines";
import type { LmsFeedErrorCode, LmsProvider } from "./feed-url";

export type LmsFeedSummary = {
  /** "https://canvas.school.edu/••••••" */
  maskedUrl: string;
  host: string | null;
  provider: LmsProvider;
  lastSyncedAt: string | null;
  lastAttemptAt: string | null;
  /** Why the last attempt failed; null after a successful sync. */
  lastError: LmsFeedErrorCode | null;
  lastErrorMessage: string | null;
  /** Counts from the last successful sync. */
  counts: LmsFeedSyncCounts | null;
  /** Courses should sync on open (never synced, or over 12 hours ago). */
  stale: boolean;
};

/** A feed deadline Atlas couldn't match to a course. */
export type LmsPendingItem = {
  id: string;
  kind: LmsDeadlineKind;
  title: string;
  dueAt: string;
  endAt: string | null;
  courseHint: string | null;
};

/** GET /api/mobile/lms-feed */
export type LmsFeedStatusResponse = {
  feed: LmsFeedSummary | null;
  needsCourse: LmsPendingItem[];
};

/** PUT /api/mobile/lms-feed (connect or replace the link). */
export type LmsFeedConnectRequest = { url: string };

/** POST /api/mobile/lms-feed/sync. ifStale: only sync when the last sync is over 12 hours old. */
export type LmsFeedSyncRequest = { ifStale?: boolean };

/** PUT and POST sync. synced is false when ifStale found a recent sync (counts is then null). */
export type LmsFeedSyncResponse = LmsFeedStatusResponse & {
  synced: boolean;
  counts: LmsFeedSyncCounts | null;
};

/** PATCH /api/mobile/lms-feed/items/:id */
export type LmsPendingItemAction =
  | { action: "assign"; courseId: string; kind?: LmsDeadlineKind }
  | { action: "skip" };

/** Validates a PATCH body. */
export function parseLmsPendingItemAction(value: unknown): { ok: true; value: LmsPendingItemAction } | { ok: false; error: string } {
  const body = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: "Request body must be an object." };
  if (body.action === "skip") return { ok: true, value: { action: "skip" } };
  if (body.action === "assign") {
    if (typeof body.courseId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.courseId)) {
      return { ok: false, error: "Choose a course." };
    }
    if (body.kind !== undefined && body.kind !== "assignment" && body.kind !== "quiz" && body.kind !== "exam") {
      return { ok: false, error: "kind must be assignment, quiz or exam." };
    }
    return { ok: true, value: { action: "assign", courseId: body.courseId, kind: body.kind as LmsDeadlineKind | undefined } };
  }
  return { ok: false, error: 'action must be "assign" or "skip".' };
}

export type LmsFeedSyncTrigger = "connect" | "manual" | "auto";

/** Properties for the lms_feed_synced analytics event: counts and the trigger only. */
export function lmsFeedSyncedProperties(counts: LmsFeedSyncCounts, trigger: LmsFeedSyncTrigger) {
  return {
    trigger,
    event_count: counts.events,
    deadline_count: counts.deadlines,
    added_count: counts.added,
    updated_count: counts.updated,
    needs_course_count: counts.needsCourse,
  };
}

/** "Synced 5 min ago" style label for the last sync. */
export function lmsLastSyncedLabel(lastSyncedAt: string | null, now: Date): string {
  if (!lastSyncedAt) return "Not synced yet";
  const ms = now.getTime() - new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(ms)) return "Not synced yet";
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days} ${days === 1 ? "day" : "days"} ago`;
}

/** One-line summary of a sync, e.g. "3 new deadlines, 1 date changed, 2 need a course". */
export function lmsSyncSummary(counts: LmsFeedSyncCounts): string {
  const parts: string[] = [];
  parts.push(`${counts.added} new ${counts.added === 1 ? "deadline" : "deadlines"}`);
  if (counts.updated > 0) parts.push(`${counts.updated} ${counts.updated === 1 ? "deadline" : "deadlines"} changed`);
  if (counts.needsCourse > 0) parts.push(`${counts.needsCourse} ${counts.needsCourse === 1 ? "needs" : "need"} a course`);
  return parts.join(", ");
}
