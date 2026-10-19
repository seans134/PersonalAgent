import { describe, expect, it } from "vitest";
import {
  initialTodayPlanState,
  parseTodayPlanResponse,
  reduceTodayPlanState,
} from "./today-plan-state";

describe("today-plan-state", () => {
  it("handles success payload and keeps plan items", () => {
    const parsed = parseTodayPlanResponse({
      plan: {
        items: [
          {
            type: "goal",
            title: "Ship spec",
            reason: "Top priority",
            startTime: "09:00",
            endTime: "09:45",
          },
        ],
        constrained: false,
      },
      meta: {
        goalsCount: 2,
        eventsCount: 1,
        generatedAt: "2026-03-04T12:00:00.000Z",
        warnings: [],
      },
    });

    const state = reduceTodayPlanState(initialTodayPlanState, {
      type: "succeeded",
      payload: parsed,
    });

    expect(state.status).toBe("success");
    if (state.status === "success") {
      expect(state.data.plan.items).toHaveLength(1);
      expect(state.data.plan.items[0].title).toBe("Ship spec");
    }
  });

  it("handles error state", () => {
    const state = reduceTodayPlanState(initialTodayPlanState, {
      type: "failed",
      message: "Authentication required.",
    });

    expect(state.status).toBe("error");
    if (state.status === "error") {
      expect(state.error).toBe("Authentication required.");
    }
  });

  it("parses and preserves warning messages", () => {
    const parsed = parseTodayPlanResponse({
      plan: {
        items: [],
        constrained: true,
        explanation: "Limited time",
      },
      meta: {
        goalsCount: 0,
        eventsCount: 0,
        generatedAt: "2026-03-04T12:00:00.000Z",
        warnings: ["Calendar read failed: token expired"],
      },
    });

    expect(parsed.meta.warnings).toHaveLength(1);
    expect(parsed.meta.warnings[0]).toMatch(/calendar read failed/i);
  });

  it("parses check-off fields and applies status and acceptance updates", () => {
    const parsed = parseTodayPlanResponse({
      plan: {
        items: [
          { type: "study", title: "Study: Midterm", reason: "Exam soon", startTime: "09:00", endTime: "10:00", key: "study:item-1", status: "done" },
          { type: "goal", title: "Read", reason: "Goal", startTime: "11:00", endTime: "11:30" },
        ],
        constrained: false,
      },
      checkoff: { planDate: "2026-10-19", timezone: "America/Toronto", acceptedAt: null },
      meta: { goalsCount: 1, eventsCount: 0, generatedAt: "2026-10-19T12:00:00.000Z", warnings: [] },
    });

    expect(parsed.plan.items.map((item) => [item.key, item.status])).toEqual([
      ["study:item-1", "done"],
      ["goal:read", null],
    ]);
    expect(parsed.checkoff).toEqual({ planDate: "2026-10-19", timezone: "America/Toronto", acceptedAt: null });

    let state = reduceTodayPlanState(initialTodayPlanState, { type: "succeeded", payload: parsed });
    state = reduceTodayPlanState(state, { type: "itemStatus", key: "goal:read", status: "skipped" });
    state = reduceTodayPlanState(state, { type: "itemStatus", key: "study:item-1", status: null });
    // A late rollback for a different (replaced) plan is ignored.
    state = reduceTodayPlanState(state, { type: "itemStatus", key: "goal:read", status: null, generatedAt: "older" });
    state = reduceTodayPlanState(state, { type: "accepted", acceptedAt: "2026-10-19T13:00:00.000Z" });
    if (state.status !== "success") throw new Error("Expected success state.");
    expect(state.data.plan.items.map((item) => item.status)).toEqual([null, "skipped"]);
    expect(state.data.checkoff?.acceptedAt).toBe("2026-10-19T13:00:00.000Z");
  });
});
