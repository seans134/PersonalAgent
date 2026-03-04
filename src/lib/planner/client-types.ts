import type { DailyPlan } from "./types";

export type TodayPlanResponse = {
  plan: DailyPlan;
  summary?: string;
  meta: {
    goalsCount: number;
    eventsCount: number;
    generatedAt: string;
    warnings: string[];
  };
};
