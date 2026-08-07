import { describe, expect, it } from "vitest";
import { generateTodayPlanForUser } from "./plan-today";

type MockState = {
  goals?: Array<{
    title: string;
    priority: number;
    task_type?: string | null;
    minimum_daily_minutes?: number | null;
  }>;
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
    timezone?: string;
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
  courseItems?: Array<{
    id: string;
    course_id: string;
    category_id: string | null;
    user_id: string;
    kind: "assignment" | "quiz" | "exam";
    title: string;
    due_at: string;
    end_at: string | null;
    location: string | null;
    score_earned: number | null;
    score_max: number;
    estimated_effort_hours: number | null;
    focus_mode: "finish_first" | "continuous" | "deferred";
    created_at: string;
  }>;
  courseItemsError?: string;
  courses?: Array<{ id: string; name: string }>;
  coursesError?: string;
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

      if (table === "course_items") {
        return {
          select() {
            return {
              eq() {
                return {
                  order: async () => ({
                    data: state.courseItems ?? [],
                    error: state.courseItemsError ? { message: state.courseItemsError } : null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "courses") {
        return {
          select() {
            return {
              eq: async () => ({
                data: state.courses ?? [],
                error: state.coursesError ? { message: state.coursesError } : null,
              }),
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
    expect(result.body.plan.items[0]?.startTime).toBe("10:30");
  });

  it("returns 400 when profile is missing", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: null,
      }) as never,
      userId: "user-1",
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "User profile is missing. Complete onboarding first." });
  });

  it("returns plan with warning when the local schedule read fails", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        localEventsError: "Calendar unavailable",
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
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.meta.warnings.length).toBe(1);
    expect(result.body.meta.warnings[0]).toMatch(/local schedule read failed/i);
    expect(result.body.meta.eventsCount).toBe(0);
  });

  it("reserves study time and blocks a same-day exam from course items", async () => {
    // Build a due_at that lands on "today" in the fallback timezone (America/Toronto)
    // regardless of when the test runs, by reading today's local date via Intl and
    // anchoring the time to mid-day UTC so DST offsets never push it into a different
    // local calendar day.
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(new Date())) {
      if (part.type !== "literal") parts[part.type] = part.value;
    }
    const todayLocalDate = `${parts.year}-${parts.month}-${parts.day}`;
    const dueAt = `${todayLocalDate}T16:00:00.000Z`;

    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: {
          work_start_time: "09:00",
          work_end_time: "20:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "none",
        },
        courses: [{ id: "course-1", name: "Biology" }],
        courseItems: [
          {
            id: "item-1",
            course_id: "course-1",
            category_id: null,
            user_id: "user-1",
            kind: "exam",
            title: "Midterm",
            due_at: dueAt,
            end_at: null,
            location: null,
            score_earned: null,
            score_max: 100,
            estimated_effort_hours: 3,
            focus_mode: "continuous",
            created_at: dueAt,
          },
        ],
      }) as never,
      userId: "user-1",
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.meta.warnings).toEqual([]);
    const studyItem = result.body.plan.items.find((item) => item.type === "study");
    expect(studyItem).toBeDefined();
    expect(studyItem?.title).toMatch(/Midterm/);
  });
});
