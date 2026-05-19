import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMealLogFromSavedMeal,
  saveMeal,
  updateSavedMeal,
} from "./actions";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

function createAuthenticatedSupabase(from: ReturnType<typeof vi.fn>) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from,
  };
}

describe("tracking actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves reusable meals with fiber", async () => {
    const insertMock = vi.fn(() => ({ error: null }));
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    createClientMock.mockResolvedValue(createAuthenticatedSupabase(fromMock));

    const result = await saveMeal(
      form({
        name: "Lentil bowl",
        calories: "520",
        protein_grams: "28",
        carbs_grams: "64",
        fat_grams: "12",
        fiber_grams: "14",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("saved_meals");
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Lentil bowl",
      calories: 520,
      protein_grams: 28,
      carbs_grams: 64,
      fat_grams: 12,
      fiber_grams: 14,
      notes: null,
    });
  });

  it("updates saved meals by id and user", async () => {
    const updateBuilder = {
      eq: vi.fn(() => updateBuilder),
    };
    const updateMock = vi.fn(() => updateBuilder);
    const fromMock = vi.fn(() => ({ update: updateMock }));
    createClientMock.mockResolvedValue(createAuthenticatedSupabase(fromMock));

    const result = await updateSavedMeal(
      form({
        id: "saved-1",
        name: "Oats",
        calories: "400",
        fiber_grams: "8",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({
      name: "Oats",
      calories: 400,
      protein_grams: null,
      carbs_grams: null,
      fat_grams: null,
      fiber_grams: 8,
      notes: null,
      updated_at: expect.any(String),
    });
    expect(updateBuilder.eq).toHaveBeenNthCalledWith(1, "id", "saved-1");
    expect(updateBuilder.eq).toHaveBeenNthCalledWith(2, "user_id", "user-1");
  });

  it("tracks a saved meal for today while preserving fiber", async () => {
    const savedMeal = {
      name: "Bean burrito",
      calories: 650,
      protein_grams: 26,
      carbs_grams: 82,
      fat_grams: 19,
      fiber_grams: 13,
      notes: "Usual order",
    };

    const savedMealBuilder = {
      select: vi.fn(() => savedMealBuilder),
      eq: vi.fn(() => savedMealBuilder),
      maybeSingle: vi.fn(async () => ({ data: savedMeal, error: null })),
    };
    const insertMock = vi.fn(() => ({ error: null }));
    const fromMock = vi.fn((table: string) => {
      if (table === "saved_meals") {
        return savedMealBuilder;
      }
      return { insert: insertMock };
    });
    createClientMock.mockResolvedValue(createAuthenticatedSupabase(fromMock));

    const result = await createMealLogFromSavedMeal(form({ saved_meal_id: "saved-1" }));

    expect(result).toEqual({ ok: true });
    expect(savedMealBuilder.select).toHaveBeenCalledWith(
      "name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes",
    );
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      logged_at: expect.any(String),
      meal_type: "meal",
      ...savedMeal,
    });
  });
});
