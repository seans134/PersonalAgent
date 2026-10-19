import { describe, expect, it } from "vitest";
import {
  applyPlanItemStatus,
  isPlanDate,
  mergePlanItemStatuses,
  nextPlanItemStatus,
  parsePlanAcceptRequest,
  parsePlanItemStatusRequest,
  planCheckoffCounts,
  planItemKey,
  planItemTitleSlug,
  withPlanItemKeys,
} from "./checkoff";
import { generateDailyPlan } from "./planner";
import type { PlannedItem } from "./types";

const preferences = {
  workStartTime: "09:00",
  workEndTime: "17:00",
  noMeetingStartTime: null,
  noMeetingEndTime: null,
  focusBlockMinutes: 60,
  workoutPreference: "none" as const,
};

function item(overrides: Partial<PlannedItem>): PlannedItem {
  return { type: "goal", title: "Read", reason: "", startTime: "09:00", endTime: "10:00", ...overrides };
}

describe("planItemKey", () => {
  it("prefers the source id and falls back to a title slug", () => {
    expect(planItemKey({ source: "study", id: "item-1", title: "Study: Midterm" })).toBe("study:item-1");
    expect(planItemKey({ source: "goal", title: "Read  Ch. 3!" })).toBe("goal:read-ch-3");
    expect(planItemKey({ source: "goal", id: "  ", title: "Read" })).toBe("goal:read");
  });

  it("slugs cosmetic title differences to the same value", () => {
    expect(planItemTitleSlug("Read ch. 3")).toBe(planItemTitleSlug("read CH 3"));
    expect(planItemTitleSlug("Révision")).toBe("revision");
    expect(planItemTitleSlug("!!!")).toBe("untitled");
  });
});

describe("withPlanItemKeys", () => {
  it("keeps planner keys, derives missing ones, and de-duplicates in order", () => {
    const keyed = withPlanItemKeys([
      item({ key: "study:a", type: "study" }),
      item({ title: "Gym", type: "fitness" }),
      item({ title: "gym", type: "fitness" }),
      item({ title: "Minimal execution plan", type: "fallback" }),
    ]);
    expect(keyed.map((entry) => entry.key)).toEqual(["study:a", "goal:gym", "goal:gym#2", "fallback:minimal-execution-plan"]);
  });
});

describe("generateDailyPlan keys", () => {
  const studyTasks = [
    { id: "course-item-1", title: "Study: Final", reason: "soon", durationMinutes: 60, priority: 1 as const, focusMode: "finish_first" as const },
  ];

  it("keys study blocks by course item id and goals by title", () => {
    const plan = generateDailyPlan({ goals: [{ title: "Read book", priority: 2 }], preferences, calendarEvents: [], studyTasks });
    expect(plan.items.map((entry) => entry.key)).toEqual(["study:course-item-1", "goal:read-book"]);
  });

  it("produces the same keys when the same plan is regenerated", () => {
    const first = generateDailyPlan({ goals: [{ title: "Read book", priority: 2 }], preferences, calendarEvents: [], studyTasks });
    const second = generateDailyPlan({ goals: [{ title: "Read book", priority: 2 }], preferences, calendarEvents: [], studyTasks });
    expect(second.items.map((entry) => entry.key)).toEqual(first.items.map((entry) => entry.key));
  });

  it("keys the constrained fallback item too", () => {
    const plan = generateDailyPlan({ goals: [], preferences, calendarEvents: [] });
    expect(plan.items.every((entry) => typeof entry.key === "string" && entry.key.length > 0)).toBe(true);
  });
});

describe("mergePlanItemStatuses", () => {
  it("shows saved marks on a regenerated plan and leaves the rest unchecked", () => {
    // Enhanced copy can rewrite titles; the planner's key is what is matched.
    const merged = mergePlanItemStatuses(
      [item({ key: "study:a", type: "study", title: "Rewritten title" }), item({ key: "goal:read" })],
      { "study:a": "done", "goal:other": "skipped" },
    );
    expect(merged.map((entry) => entry.status)).toEqual(["done", null]);
  });
});

describe("check-off helpers", () => {
  it("toggles a tapped status off and switches between statuses", () => {
    expect(nextPlanItemStatus(null, "done")).toBe("done");
    expect(nextPlanItemStatus("done", "done")).toBeNull();
    expect(nextPlanItemStatus("skipped", "done")).toBe("done");
  });

  it("applies one status and counts marks", () => {
    const items = [item({ key: "a" }), item({ key: "b", status: "skipped" })];
    const updated = applyPlanItemStatus(items, "a", "done");
    expect(updated[0].status).toBe("done");
    expect(items[0].status).toBeUndefined();
    expect(planCheckoffCounts(updated)).toEqual({ item_count: 2, done_count: 1, skipped_count: 1 });
  });

  it("validates plan dates", () => {
    expect(isPlanDate("2026-10-19")).toBe(true);
    expect(isPlanDate("2026-02-30")).toBe(false);
    expect(isPlanDate("2026-1-1")).toBe(false);
    expect(isPlanDate(20261019)).toBe(false);
  });
});

describe("request parsing", () => {
  it("accepts a status write and an undo", () => {
    const body = { planDate: "2026-10-19", itemKey: "study:a", itemType: "study", status: "done" };
    expect(parsePlanItemStatusRequest(body)).toEqual({ ok: true, value: body });
    expect(parsePlanItemStatusRequest({ ...body, status: null })).toEqual({ ok: true, value: { ...body, status: null } });
  });

  it("rejects bad status writes", () => {
    const body = { planDate: "2026-10-19", itemKey: "study:a", itemType: "study", status: "done" };
    expect(parsePlanItemStatusRequest(null).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, status: "later" }).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, status: undefined }).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, itemKey: "" }).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, itemKey: "x".repeat(201) }).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, itemType: "meeting" }).ok).toBe(false);
    expect(parsePlanItemStatusRequest({ ...body, planDate: "today" }).ok).toBe(false);
  });

  it("parses accept requests", () => {
    expect(parsePlanAcceptRequest({ planDate: "2026-10-19", itemCount: 3 })).toEqual({
      ok: true,
      value: { planDate: "2026-10-19", itemCount: 3 },
    });
    expect(parsePlanAcceptRequest({ planDate: "2026-10-19", itemCount: -1 }).ok).toBe(false);
    expect(parsePlanAcceptRequest({ planDate: "2026-10-19", itemCount: 1.5 }).ok).toBe(false);
    expect(parsePlanAcceptRequest({ itemCount: 1 }).ok).toBe(false);
  });
});
