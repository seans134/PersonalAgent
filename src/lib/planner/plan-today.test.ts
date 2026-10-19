import { describe, expect, it, vi } from "vitest";
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
    end_day_offset?: 0 | 1;
    effective_from?: string | null;
    effective_until?: string | null;
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
    effective_from?: string | null;
    effective_until?: string | null;
    end_day_offset?: number;
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
  planItemStatuses?: Array<{ item_key: string; status: "done" | "skipped" }>;
  /** Rows the earlier-days study query returns (plan_date before today). */
  studyDoneRows?: Array<{ item_key: string; plan_date: string; status: "done"; minutes: number | null }>;
  acceptedAt?: string;
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
        const query = { select: () => query, eq: () => query, gte: () => query, lte: () => query, order: async () => ({ data: state.localEvents ?? [], error: state.localEventsError ? { message: state.localEventsError } : null }) };
        return query;
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

      if (table === "plan_item_statuses") {
        let earlierDays = false;
        const query = {
          select: () => query,
          eq: () => query,
          gte: () => query,
          lt: () => {
            earlierDays = true;
            return query;
          },
          then: (resolve: (value: unknown) => void) =>
            resolve({ data: earlierDays ? state.studyDoneRows ?? [] : state.planItemStatuses ?? [], error: null }),
        };
        return query;
      }

      if (table === "plan_acceptances") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.acceptedAt ? { accepted_at: state.acceptedAt } : null, error: null }) };
        return query;
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

  it("shows saved check-offs and the acceptance on a regenerated plan", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [{ title: "Ship roadmap", priority: 1 }],
        profile: {
          work_start_time: "09:00",
          work_end_time: "17:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "none",
          timezone: "UTC",
        },
        planItemStatuses: [{ item_key: "goal:ship-roadmap", status: "done" }],
        acceptedAt: "2026-10-19T09:00:00.000Z",
      }) as never,
      userId: "user-1",
      // Enhanced copy rewrites titles; the key still matches.
      enhancePlan: async ({ plan }) => ({ plan: { ...plan, items: plan.items.map((item) => ({ ...item, title: "Rewritten" })) } }),
    });

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    const goal = result.body.plan.items.find((item) => item.key === "goal:ship-roadmap");
    expect(goal?.status).toBe("done");
    expect(result.body.checkoff.acceptedAt).toBe("2026-10-19T09:00:00.000Z");
    expect(result.body.checkoff.planDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.body.checkoff.timezone).toBe("UTC");
    expect(result.body.meta.warnings).toEqual([]);
  });

  it("plans with zero goals now that goals are optional", async () => {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({
        goals: [],
        profile: {
          work_start_time: "09:00",
          work_end_time: "17:00",
          no_meeting_start: null,
          no_meeting_end: null,
          focus_block_minutes: 60,
          workout_preference: "none",
        },
        scheduleBlocks: [
          { id: "class-1", title: "CHEM 201 lecture", days_of_week: [0, 1, 2, 3, 4, 5, 6], start_time: "10:00", end_time: "11:00" },
        ],
      }) as never,
      userId: "user-1",
      enhancePlan: async ({ plan }) => ({ plan }),
    });

    expect(result.status).toBe(200);

    if ("error" in result.body) {
      throw new Error("Expected successful plan body.");
    }

    expect(result.body.meta.goalsCount).toBe(0);
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

it("blocks yesterday's overnight tail using the profile timezone", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T07:00:00Z"));
  try {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({ goals: [], profile: { work_start_time: "05:00", work_end_time: "10:00", no_meeting_start: null, no_meeting_end: null, focus_block_minutes: 30, workout_preference: "none", timezone: "America/Toronto" },
        localEvents: [{ id: "night", title: "Overnight work", event_date: "2026-10-31", start_time: "22:00:00", end_time: "06:00:00", end_day_offset: 1 }],
        scheduleBlocks: [{ id: "old", title: "Expired class", days_of_week: [0], start_time: "08:00", end_time: "09:00", effective_until: "2026-10-31" }],
      }) as never, userId: "user-1", enhancePlan: async ({ plan }) => ({ plan }),
    });
    if ("error" in result.body) throw new Error(result.body.error);
    expect(result.body.meta.warnings).toEqual([]);
    expect(result.body.contextEvents).toHaveLength(1);
    expect(result.body.contextEvents[0]).toMatchObject({ title: "Overnight work", startTime: "00:00", endTime: "06:00" });
    expect(result.body.plan.items.every((item) => item.startTime >= "06:00")).toBe(true);
  } finally { vi.useRealTimers(); }
});

describe("generateTodayPlanForUser study ramp", () => {
  const profile = {
    work_start_time: "08:00",
    work_end_time: "20:00",
    no_meeting_start: null,
    no_meeting_end: null,
    focus_block_minutes: 60,
    workout_preference: "none" as const,
    timezone: "UTC",
  };
  const todayUtc = new Date().toISOString().slice(0, 10);
  const shift = (days: number) => new Date(Date.parse(`${todayUtc}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const exam = {
    id: "item-1", course_id: "course-1", category_id: null, user_id: "user-1", kind: "exam" as const,
    title: "Midterm", due_at: `${shift(3)}T15:00:00.000Z`, end_at: null, location: null, score_earned: null,
    score_max: 100, estimated_effort_hours: null, focus_mode: "continuous" as const, created_at: `${shift(-10)}T00:00:00.000Z`,
  };

  async function studyBlock(studyDoneRows: MockState["studyDoneRows"]) {
    const result = await generateTodayPlanForUser({
      supabase: createSupabaseMock({ goals: [], profile, courses: [{ id: "course-1", name: "Biology" }], courseItems: [exam], studyDoneRows }) as never,
      userId: "user-1",
      enhancePlan: async ({ plan }) => ({ plan }),
    });
    if ("error" in result.body) throw new Error("Expected successful plan body.");
    expect(result.body.meta.warnings).toEqual([]);
    const item = result.body.plan.items.find((entry) => entry.type === "study");
    if (!item) throw new Error("Expected a study block.");
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    return { reason: item.reason, minutes: minutes(item.endTime) - minutes(item.startTime) };
  }

  it("names the ramp day and shrinks today's block by study done on earlier days", async () => {
    const fresh = await studyBlock([]);
    expect(fresh.reason).toBe("Biology · Exam in 3 days · day 5 of 7 of your study ramp.");
    expect(fresh.minutes).toBe(120);

    const afterProgress = await studyBlock([
      { item_key: "study:item-1", plan_date: shift(-2), status: "done", minutes: 150 },
      { item_key: "study:item-1", plan_date: shift(-1), status: "done", minutes: 120 },
    ]);
    expect(afterProgress.minutes).toBe(25); // 90 min left over days 5-7
  });
});
