import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePlanningPreferences } from "./actions";

const { createClientMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

function mockProfileUpsert() {
  const upsertMock = vi.fn(async () => ({ error: null }));
  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: vi.fn(() => ({ upsert: upsertMock })),
  });
  return upsertMock;
}

const planningFields = {
  work_start_time: "09:00",
  work_end_time: "17:00",
  focus_block_minutes: "60",
  timezone: "America/Toronto",
};

describe("updatePlanningPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the workout preference when the form sends it", async () => {
    const upsertMock = mockProfileUpsert();

    await updatePlanningPreferences(form({ ...planningFields, workout_preference: "moderate" }));

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ workout_preference: "moderate" }),
      { onConflict: "user_id" },
    );
  });

  it("leaves the stored workout preference alone when the field is hidden", async () => {
    const upsertMock = mockProfileUpsert();

    await updatePlanningPreferences(form(planningFields));

    const [row] = upsertMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(row).not.toHaveProperty("workout_preference");
    expect(row).toMatchObject({ user_id: "user-1", focus_block_minutes: 60 });
  });
});
