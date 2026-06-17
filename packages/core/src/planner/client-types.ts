import type { DailyPlan } from "./types";

export type TodayPlanContextEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  source: "google" | "local" | "schedule";
};

export type TodayPlanResponse = {
  plan: DailyPlan;
  contextEvents: TodayPlanContextEvent[];
  summary?: string;
  meta: {
    goalsCount: number;
    eventsCount: number;
    generatedAt: string;
    warnings: string[];
  };
};
