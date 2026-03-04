import type { TodayPlanResponse } from "@/lib/planner/client-types";

type RecordValue = Record<string, unknown>;

export type TodayPlanPanelState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: null; error: null }
  | { status: "error"; data: null; error: string }
  | { status: "success"; data: TodayPlanResponse; error: null };

export type TodayPlanPanelAction =
  | { type: "start" }
  | { type: "failed"; message: string }
  | { type: "succeeded"; payload: TodayPlanResponse };

export const initialTodayPlanState: TodayPlanPanelState = {
  status: "idle",
  data: null,
  error: null,
};

export function reduceTodayPlanState(
  state: TodayPlanPanelState,
  action: TodayPlanPanelAction,
): TodayPlanPanelState {
  switch (action.type) {
    case "start":
      return { status: "loading", data: null, error: null };
    case "failed":
      return { status: "error", data: null, error: action.message };
    case "succeeded":
      return { status: "success", data: action.payload, error: null };
    default:
      return state;
  }
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

export function parseTodayPlanResponse(payload: unknown): TodayPlanResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid response payload.");
  }

  const plan = payload.plan;
  const meta = payload.meta;

  if (!isRecord(plan) || !isRecord(meta)) {
    throw new Error("Invalid plan response shape.");
  }

  const itemsRaw = plan.items;
  if (!Array.isArray(itemsRaw)) {
    throw new Error("Invalid plan items.");
  }

  const items = itemsRaw.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid plan item at index ${index}.`);
    }

    return {
      type: asString(item.type, "item.type") as "goal" | "focus" | "wellbeing" | "fallback",
      title: asString(item.title, "item.title"),
      reason: asString(item.reason, "item.reason"),
      startTime: asString(item.startTime, "item.startTime"),
      endTime: asString(item.endTime, "item.endTime"),
    };
  });

  return {
    plan: {
      items,
      constrained: Boolean(plan.constrained),
      explanation: typeof plan.explanation === "string" ? plan.explanation : undefined,
    },
    meta: {
      goalsCount: asNumber(meta.goalsCount, "meta.goalsCount"),
      eventsCount: asNumber(meta.eventsCount, "meta.eventsCount"),
      generatedAt: asString(meta.generatedAt, "meta.generatedAt"),
      warnings: asStringArray(meta.warnings, "meta.warnings"),
    },
  };
}
