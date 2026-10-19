import { dateInTimezone } from "../calendar";
import type { TodayPlanCheckoff } from "./client-types";
import type { PlannedItem, PlannedItemType, PlanItemStatus } from "./types";

// Plan check-off: students mark today's plan items done or skipped, and the marks
// survive regenerating the plan. A mark is stored per user, per local plan date,
// per item key. The key is built from where the item came from, never from copy
// the AI enhancement may rewrite:
//   study items     -> "study:<course item id>"  (one study block per course item per day)
//   goal items      -> "goal:<goal id>"           ("goal:<title slug>" when a goal has no id)
//   fallback items  -> "fallback:<title slug>"
// Two items that would share a key (e.g. duplicate goal titles) get "#2", "#3", ...
// in plan order, so regenerating the same plan maps each mark back to the same block.

export const PLAN_ITEM_STATUSES = ["done", "skipped"] as const satisfies readonly PlanItemStatus[];
export const PLAN_ITEM_TYPES = ["goal", "focus", "fitness", "wellness", "study", "fallback"] as const satisfies readonly PlannedItemType[];
export const PLAN_ITEM_KEY_MAX_LENGTH = 200;

export type PlanItemKeySource = "study" | "goal" | "fallback";

/** Lowercase, punctuation-free, hyphenated title so cosmetic edits ("Read ch. 3" vs "read ch 3") keep the key. */
export function planItemTitleSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 120) || "untitled";
}

export function planItemKey(input: { source: PlanItemKeySource; id?: string | null; title: string }): string {
  const id = input.id?.trim();
  return id ? `${input.source}:${id}` : `${input.source}:${planItemTitleSlug(input.title)}`;
}

function sourceForType(type: PlannedItemType): PlanItemKeySource {
  if (type === "study") return "study";
  if (type === "fallback") return "fallback";
  return "goal";
}

/** Gives every item a key (deriving one from type and title when the planner did not) and de-duplicates them. */
export function withPlanItemKeys<T extends PlannedItem>(items: T[]): Array<T & { key: string }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = item.key || planItemKey({ source: sourceForType(item.type), title: item.title });
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { ...item, key: count === 1 ? base : `${base}#${count}` };
  });
}

/** Sets each item's status from the saved marks; items without a mark get null. */
export function mergePlanItemStatuses<T extends PlannedItem>(
  items: T[],
  statuses: Record<string, PlanItemStatus>,
): Array<T & { key: string; status: PlanItemStatus | null }> {
  return withPlanItemKeys(items).map((item) => ({ ...item, status: statuses[item.key] ?? null }));
}

/** Returns the items with one item's status replaced (null clears it), for optimistic UI updates. */
export function applyPlanItemStatus<T extends PlannedItem>(items: T[], key: string, status: PlanItemStatus | null): T[] {
  return items.map((item) => (item.key === key ? { ...item, status } : item));
}

/** Tapping the status an item already has undoes it; tapping another status switches to it. */
export function nextPlanItemStatus(current: PlanItemStatus | null | undefined, tapped: PlanItemStatus): PlanItemStatus | null {
  return current === tapped ? null : tapped;
}

/** Counts for analytics (counts only, never titles). */
export function planCheckoffCounts(items: Pick<PlannedItem, "status">[]) {
  return {
    item_count: items.length,
    done_count: items.filter((item) => item.status === "done").length,
    skipped_count: items.filter((item) => item.status === "skipped").length,
  };
}

export function isPlanItemStatus(value: unknown): value is PlanItemStatus {
  return typeof value === "string" && (PLAN_ITEM_STATUSES as readonly string[]).includes(value);
}

export function isPlanItemType(value: unknown): value is PlannedItemType {
  return typeof value === "string" && (PLAN_ITEM_TYPES as readonly string[]).includes(value);
}

export function isPlanItemKey(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= PLAN_ITEM_KEY_MAX_LENGTH;
}

/** A real calendar date written YYYY-MM-DD. */
export function isPlanDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Today's date (YYYY-MM-DD) in the given timezone, the profile timezone the server dated the plan in.
 * Falls back to the device's local date when no (or an unknown) timezone is given, e.g. older cached plans.
 */
export function localPlanDate(timezone?: string | null, now: Date = new Date()): string {
  if (timezone) {
    try {
      return dateInTimezone(now, timezone);
    } catch {
      // Unknown IANA zone on this runtime; use the device date.
    }
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether a plan's check-off date is still today in the timezone the server used for it. */
export function isCheckoffForToday(checkoff: Pick<TodayPlanCheckoff, "planDate" | "timezone">, now: Date = new Date()): boolean {
  return checkoff.planDate === localPlanDate(checkoff.timezone, now);
}

/** Check-offs are accepted for the student's local today ±1 day (covers clock and timezone edges). */
export const PLAN_DATE_WINDOW_DAYS = 1;

export function isPlanDateInWindow(planDate: string, todayPlanDate: string, windowDays = PLAN_DATE_WINDOW_DAYS): boolean {
  if (!isPlanDate(planDate) || !isPlanDate(todayPlanDate)) return false;
  const diffDays = (Date.parse(`${planDate}T00:00:00Z`) - Date.parse(`${todayPlanDate}T00:00:00Z`)) / 86_400_000;
  return Math.abs(diffDays) <= windowDays;
}

// ---- /api/mobile/plan/* contract (shared by web and mobile) ----

/** GET /api/mobile/plan/status?date=YYYY-MM-DD (date defaults to the student's local today). */
export type PlanStatusResponse = {
  planDate: string;
  statuses: Record<string, PlanItemStatus>;
  acceptedAt: string | null;
};

/** PUT /api/mobile/plan/status. status null clears the mark (undo). */
export type PlanItemStatusRequest = {
  planDate: string;
  itemKey: string;
  itemType: PlannedItemType;
  status: PlanItemStatus | null;
};

export type PlanItemStatusResponse = {
  planDate: string;
  itemKey: string;
  status: PlanItemStatus | null;
};

/** POST /api/mobile/plan/accept. Accepting again keeps the first acceptance time. */
export type PlanAcceptRequest = {
  planDate: string;
  itemCount: number;
};

export type PlanAcceptResponse = {
  planDate: string;
  acceptedAt: string;
  /** True only for the request that recorded the acceptance; clients fire plan_accepted on true. */
  created: boolean;
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parsePlanItemStatusRequest(body: unknown): ParseResult<PlanItemStatusRequest> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Request body must be an object." };
  if (!isPlanDate(record.planDate)) return { ok: false, error: "planDate must be a YYYY-MM-DD date." };
  if (!isPlanItemKey(record.itemKey)) return { ok: false, error: `itemKey must be 1-${PLAN_ITEM_KEY_MAX_LENGTH} characters.` };
  if (!isPlanItemType(record.itemType)) return { ok: false, error: "itemType is not a plan item type." };
  if (record.status !== null && !isPlanItemStatus(record.status)) {
    return { ok: false, error: "status must be \"done\", \"skipped\", or null." };
  }
  return {
    ok: true,
    value: { planDate: record.planDate, itemKey: record.itemKey, itemType: record.itemType, status: record.status },
  };
}

export function parsePlanAcceptRequest(body: unknown): ParseResult<PlanAcceptRequest> {
  const record = asRecord(body);
  if (!record) return { ok: false, error: "Request body must be an object." };
  if (!isPlanDate(record.planDate)) return { ok: false, error: "planDate must be a YYYY-MM-DD date." };
  const itemCount = record.itemCount;
  if (typeof itemCount !== "number" || !Number.isInteger(itemCount) || itemCount < 0 || itemCount > 100) {
    return { ok: false, error: "itemCount must be a whole number from 0 to 100." };
  }
  return { ok: true, value: { planDate: record.planDate, itemCount } };
}
