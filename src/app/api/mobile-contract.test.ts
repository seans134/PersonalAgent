/**
 * Mobile API contract guard.
 *
 * The Expo app (mobile/lib/api.ts) calls a handful of routes that live OUTSIDE
 * the `/api/mobile/*` namespace — the web app's own `/api/tracking/*` and
 * `/api/onboarding/*` routes. Those routes are otherwise free to be refactored
 * for the web UI, so a rename/removal of a response field would break the
 * mobile app silently, with no type error and no failing web test.
 *
 * This suite pins the RESPONSE ENVELOPE that mobile depends on for each of
 * those shared routes. It is intentionally decoupled from the routes' internal
 * logic: parse/validate helpers and Supabase are mocked, so the only thing
 * asserted is the outward shape mobile reads. If you change one of these
 * envelopes, update mobile/lib/api.ts in the same change and adjust this test.
 *
 * Each guarded route carries a comment pointing back here.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  revalidatePath: vi.fn(),
  // tracking/natural-language-meal
  validateMeal: vi.fn((_draft: unknown, mode: "log" | "saved") => ({
    mode,
    name: "Test meal",
    meal_type: "lunch",
    logged_at: "2026-01-01T12:00:00.000Z",
    calories: 100,
    protein_grams: 10,
    carbs_grams: 10,
    fat_grams: 10,
    fiber_grams: 1,
    notes: null,
  })),
  parseMeal: vi.fn(async () => ({ mode: "log", warnings: [] })),
  // tracking/natural-language-workout
  validateWorkout: vi.fn(() => ({
    logged_at: "2026-01-01T12:00:00.000Z",
    workout_type: "run",
    tracking_method: "manual",
    title: "Test run",
    duration_minutes: 30,
    intensity: "moderate",
  })),
  validateWorkoutSchedule: vi.fn(() => ({ items: [{ day_of_week: 1, title: "Test run" }] })),
  parseWorkoutSchedule: vi.fn(async () => ({ items: [] })),
  parseWorkout: vi.fn(async () => ({ warnings: [] })),
  // onboarding/natural-language
  validateOnboarding: vi.fn(() => ({ profile: {}, goals: [], scheduleBlocks: [] })),
  parseOnboarding: vi.fn(async () => ({ profile: {}, goals: [], scheduleBlocks: [] })),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: mocks.getAuth }));
vi.mock("@/lib/tracking/natural-language-meal", () => ({
  validateNaturalLanguageMealDraft: mocks.validateMeal,
  parseNaturalLanguageMeal: mocks.parseMeal,
}));
vi.mock("@/lib/tracking/natural-language-workout", () => ({
  validateNaturalLanguageWorkoutDraft: mocks.validateWorkout,
  validateNaturalLanguageWorkoutScheduleDraft: mocks.validateWorkoutSchedule,
  parseNaturalLanguageWorkoutSchedule: mocks.parseWorkoutSchedule,
  parseNaturalLanguageWorkout: mocks.parseWorkout,
}));
vi.mock("@/lib/onboarding/natural-language", () => ({
  validateNaturalLanguageOnboardingDraft: mocks.validateOnboarding,
  parseNaturalLanguageOnboarding: mocks.parseOnboarding,
}));

/** Chainable Supabase query mock: every method returns the builder, which is
 *  awaitable and resolves to `result`. Covers insert/upsert/select/eq chains. */
function makeSupabase(result: { data?: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "upsert", "eq", "in", "order", "limit", "maybeSingle"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { from: vi.fn(() => builder) };
}

function authOk(supabaseResult?: { data?: unknown; error: unknown }) {
  mocks.getAuth.mockResolvedValue({ user: { id: "user-1" }, supabase: makeSupabase(supabaseResult) });
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mobile contract: leaked /api/tracking/* and /api/onboarding/* routes", () => {
  it("POST /api/onboarding/parse returns { draft }", async () => {
    authOk();
    const { POST } = await import("./onboarding/parse/route");
    const res = await POST(post("/api/onboarding/parse", { mode: "goals", text: "hi", timezone: "America/Toronto" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("draft");
  });

  it("POST /api/onboarding/apply returns { applied: { goalsCreated, scheduleBlocksCreated } }", async () => {
    authOk();
    const { POST } = await import("./onboarding/apply/route");
    const res = await POST(post("/api/onboarding/apply", { mode: "goals", draft: {}, timezone: "America/Toronto" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual(
      expect.objectContaining({
        goalsCreated: expect.any(Number),
        scheduleBlocksCreated: expect.any(Number),
      }),
    );
  });

  it("POST /api/tracking/meals/apply returns { applied: { mealsLogged } }", async () => {
    authOk({ error: null });
    const { POST } = await import("./tracking/meals/apply/route");
    const res = await POST(post("/api/tracking/meals/apply", { draft: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual(expect.objectContaining({ mealsLogged: expect.any(Number) }));
  });

  it("POST /api/tracking/meals/saved/apply returns { applied: { savedMealsCreated } }", async () => {
    authOk({ error: null });
    const { POST } = await import("./tracking/meals/saved/apply/route");
    const res = await POST(post("/api/tracking/meals/saved/apply", { draft: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual(expect.objectContaining({ savedMealsCreated: expect.any(Number) }));
  });

  it("POST /api/tracking/workouts/apply returns { applied: { workoutsCreated } }", async () => {
    authOk({ error: null });
    const { POST } = await import("./tracking/workouts/apply/route");
    const res = await POST(post("/api/tracking/workouts/apply", { draft: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual(expect.objectContaining({ workoutsCreated: expect.any(Number) }));
  });

  it("POST /api/tracking/workouts/plan/parse returns { draft }", async () => {
    authOk();
    const { POST } = await import("./tracking/workouts/plan/parse/route");
    const res = await POST(post("/api/tracking/workouts/plan/parse", { text: "run monday", timezone: "America/Toronto" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("draft");
  });

  it("POST /api/tracking/workouts/plan/apply returns { applied: { scheduleItemsCreated } }", async () => {
    authOk({ data: [], error: null });
    const { POST } = await import("./tracking/workouts/plan/apply/route");
    const res = await POST(post("/api/tracking/workouts/plan/apply", { draft: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toEqual(expect.objectContaining({ scheduleItemsCreated: expect.any(Number) }));
  });

  it("POST /api/tracking/meals/assistant returns { intent, intent_source }", async () => {
    authOk();
    const { POST } = await import("./tracking/meals/assistant/route");
    // forceIntent bypasses the classifier so the shape is deterministic.
    const res = await POST(post("/api/tracking/meals/assistant", { text: "ate a sandwich", forceIntent: "log" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("intent");
    expect(body).toHaveProperty("intent_source");
  });

  it("POST /api/tracking/workouts/assistant returns { intent, intent_source }", async () => {
    authOk();
    const { POST } = await import("./tracking/workouts/assistant/route");
    const res = await POST(post("/api/tracking/workouts/assistant", { text: "ran 5k", forceIntent: "log" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("intent");
    expect(body).toHaveProperty("intent_source");
  });

  it("returns 401 for the shared routes when unauthenticated", async () => {
    mocks.getAuth.mockResolvedValue(null);
    const { POST } = await import("./tracking/meals/apply/route");
    const res = await POST(post("/api/tracking/meals/apply", { draft: {} }));
    expect(res.status).toBe(401);
  });
});
