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
});
