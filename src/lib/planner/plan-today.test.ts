import { describe, expect, it } from "vitest";
import { generateTodayPlanForUser } from "./plan-today";

type MockState = {
  goals?: Array<{ title: string; priority: number }>;
  goalsError?: string;
  profile?: {
    work_start_time: string;
    work_end_time: string;
    no_meeting_start: string | null;
    no_meeting_end: string | null;
    focus_block_minutes: number;
    workout_preference: "none" | "light" | "moderate" | "intense";
  } | null;
  profileError?: string;
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
