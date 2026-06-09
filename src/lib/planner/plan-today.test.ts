import { describe, expect, it } from "vitest";
import { generateTodayPlanForUser } from "./plan-today";

type MockState = {
  goals?: Array<{ title: string; priority: number }>;
  goalsError?: string;
  localEvents?: Array<{
    id: string;
    title: string;
    event_date: string;
    start_time: string;
    end_time: string;
  }>;
  localEventsError?: string;
  profile?: {
    work_start_time: string;
    work_end_time: string;
    no_meeting_start: string | null;
    no_meeting_end: string | null;
    focus_block_minutes: number;
    workout_preference: "none" | "light" | "moderate" | "intense";
  } | null;
  profileError?: string;
  scheduleBlocks?: Array<{
    id: string;
    title: string;
    days_of_week: number[];
    start_time: string;
    end_time: string;
  }>;
  scheduleBlocksError?: string;
};

function createSupabaseMock(state: MockState) {
  return {
    from(table: string) {
      if (table === "goals") {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return {
                      order: async () => ({
                        data: state.goals ?? [],
                        error: state.goalsError ? { message: state.goalsError } : null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "user_profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: state.profile ?? null,
                    error: state.profileError ? { message: state.profileError } : null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "calendar_events") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order: async () => ({
                        data: state.localEvents ?? [],
                        error: state.localEventsError ? { message: state.localEventsError } : null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "schedule_blocks") {
        return {
          select() {
            return {
              eq() {
                return {
                  order: async () => ({
                    data: state.scheduleBlocks ?? [],
                    error: state.scheduleBlocksError ? { message: state.scheduleBlocksError } : null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("generateTodayPlanForUser", () => {
  it("returns success response with plan and meta", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: {
          work_start_time: "09:00",
          work_end_time: "17:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "moderate",
        },
      }) as never,
      userId: "user-1",
      fetchEvents: async () => [],
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.meta.goalsCount).toBe(1);
    expect(result.body.meta.eventsCount).toBe(0);
    expect(Array.isArray(result.body.plan.items)).toBe(true);
  });

  it("includes local schedule blocks as context events and planner busy time", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: {
          work_start_time: "09:00",
          work_end_time: "12:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "none",
        },
        scheduleBlocks: [
          {
            id: "block-1",
            title: "Class",
            days_of_week: [0, 1, 2, 3, 4, 5, 6],
            start_time: "09:00:00",
            end_time: "10:00:00",
          },
        ],
      }) as never,
      userId: "user-1",
      fetchEvents: async () => [],
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.contextEvents).toEqual([
      {
        id: "schedule-block-1",
        title: "Class",
        startTime: "09:00",
        endTime: "10:00",
        source: "schedule",
      },
    ]);
    expect(result.body.meta.eventsCount).toBe(1);
    expect(result.body.plan.items[0]?.startTime).toBe("10:00");
  });

  it("returns 400 when profile is missing", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: null,
      }) as never,
      userId: "user-1",
      fetchEvents: async () => [],
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "User profile is missing. Complete onboarding first." });
  });

  it("returns plan with warning when calendar read fails", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: {
          work_start_time: "09:00",
          work_end_time: "17:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "light",
        },
      }) as never,
      userId: "user-1",
      fetchEvents: async () => {
        throw new Error("Calendar unavailable");
      },
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.meta.warnings.length).toBe(1);
    expect(result.body.meta.warnings[0]).toMatch(/calendar read failed/i);
    expect(result.body.meta.eventsCount).toBe(0);
  });
});
