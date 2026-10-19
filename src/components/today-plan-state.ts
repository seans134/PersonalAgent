import { applyPlanItemStatus, isPlanDate, isPlanItemStatus, withPlanItemKeys, type PlanItemStatus } from "@personal-agent/core/planner";
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
  | { type: "succeeded"; payload: TodayPlanResponse }
  /** generatedAt, when set, limits the update to that plan (so a late rollback can't touch a regenerated plan). */
  | { type: "itemStatus"; key: string; status: PlanItemStatus | null; generatedAt?: string }
  | { type: "accepted"; acceptedAt: string };

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
    case "itemStatus":
      if (state.status !== "success") return state;
      if (action.generatedAt && action.generatedAt !== state.data.meta.generatedAt) return state;
      return {
        ...state,
        data: { ...state.data, plan: { ...state.data.plan, items: applyPlanItemStatus(state.data.plan.items, action.key, action.status) } },
      };
    case "accepted":
      if (state.status !== "success" || !state.data.checkoff) return state;
      return { ...state, data: { ...state.data, checkoff: { ...state.data.checkoff, acceptedAt: action.acceptedAt } } };
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

function parseContextEvents(value: unknown): TodayPlanResponse["contextEvents"] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Invalid context events.");
  }

  return value.map((event, index) => {
    if (!isRecord(event)) {
      throw new Error(`Invalid context event at index ${index}.`);
    }

    return {
      id: asString(event.id, "contextEvent.id"),
      title: asString(event.title, "contextEvent.title"),
      startTime: asString(event.startTime, "contextEvent.startTime"),
      endTime: asString(event.endTime, "contextEvent.endTime"),
      source: asString(event.source, "contextEvent.source") as "local" | "schedule",
    };
  });
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
      type: asString(item.type, "item.type") as "goal" | "focus" | "fitness" | "wellness" | "study" | "fallback",
      title: asString(item.title, "item.title"),
      reason: asString(item.reason, "item.reason"),
      startTime: asString(item.startTime, "item.startTime"),
      endTime: asString(item.endTime, "item.endTime"),
      ...(typeof item.key === "string" ? { key: item.key } : {}),
      status: isPlanItemStatus(item.status) ? item.status : null,
    };
  });

  const checkoff = isRecord(payload.checkoff) && isPlanDate(payload.checkoff.planDate)
    ? {
        planDate: payload.checkoff.planDate,
        ...(typeof payload.checkoff.timezone === "string" ? { timezone: payload.checkoff.timezone } : {}),
        acceptedAt: typeof payload.checkoff.acceptedAt === "string" ? payload.checkoff.acceptedAt : null,
      }
    : undefined;

  return {
    plan: {
      items: withPlanItemKeys(items),
      constrained: Boolean(plan.constrained),
      explanation: typeof plan.explanation === "string" ? plan.explanation : undefined,
    },
    contextEvents: parseContextEvents(payload.contextEvents),
    summary: typeof payload.summary === "string" ? payload.summary : undefined,
    checkoff,
    meta: {
      goalsCount: asNumber(meta.goalsCount, "meta.goalsCount"),
      eventsCount: asNumber(meta.eventsCount, "meta.eventsCount"),
      generatedAt: asString(meta.generatedAt, "meta.generatedAt"),
      warnings: asStringArray(meta.warnings, "meta.warnings"),
    },
  };
}
