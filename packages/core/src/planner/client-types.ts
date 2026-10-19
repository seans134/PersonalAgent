import type { DailyPlan } from "./types";

export type TodayPlanContextEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  source: "local" | "schedule";
};

/** Today's check-off state: the student's local plan date and when they committed to the plan. */
export type TodayPlanCheckoff = {
  planDate: string;
  acceptedAt: string | null;
};

export type TodayPlanResponse = {
  plan: DailyPlan;
  contextEvents: TodayPlanContextEvent[];
  summary?: string;
  /** Present on plans from this version on; absent on older cached plans. */
  checkoff?: TodayPlanCheckoff;
  meta: {
    goalsCount: number;
    eventsCount: number;
    generatedAt: string;
    warnings: string[];
  };
};
