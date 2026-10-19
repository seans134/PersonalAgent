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
 * Each guarded route carries a comment pointing back here. The same applies to
 * web routes that `/api/mobile/*` re-exports verbatim (the syllabus import pair).
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
  // courses/syllabus-parse (validateSyllabusDraft stays real; it's pure)
  parseSyllabus: vi.fn(),
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
vi.mock("@/lib/courses/syllabus-parse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/courses/syllabus-parse")>()),
  parseSyllabus: mocks.parseSyllabus,
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

/** Supabase mock for the syllabus apply route: per-table results (courses ends in .single()),
 *  recording what each table was asked to insert. */
function makeImportSupabase() {
  const inserted: Record<string, unknown> = {};
  const results: Record<string, { data?: unknown; error: unknown }> = {
    courses: { data: { id: "course-1" }, error: null },
    course_categories: {
      data: [
        { id: "cat-hw", name: "Homework" },
        { id: "cat-exam", name: "Exams" },
      ],
      error: null,
    },
    course_items: { error: null },
  };
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn((rows: unknown) => {
      inserted[table] = rows;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    builder.then = (resolve: (value: unknown) => unknown) => resolve(results[table]);
    return builder;
  });
  return { supabase: { from }, inserted };
}

function postForm(path: string, form: FormData) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: form });
}

const syllabusDraft = {
  course: { name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026", target_grade: 85 },
  categories: [
    { name: "Homework", weight: 40, position: 0 },
    { name: "Exams", weight: 60, position: 1 },
  ],
  items: [
    { kind: "assignment", title: "PS 1", categoryName: "Homework", due_at: "2026-10-01T16:00:00.000Z", score_max: 10, include: true },
    { kind: "exam", title: "Midterm", categoryName: "Exams", due_at: "2026-10-20T14:00:00.000Z", score_max: 100, include: true },
    { kind: "quiz", title: "Pop quiz", categoryName: null, due_at: null, score_max: 100, include: false },
  ],
  warnings: [],
};

describe("mobile contract: /api/mobile/courses/import/*", () => {
  it("POST /api/mobile/courses/import/parse returns 401 without auth", async () => {
    mocks.getAuth.mockResolvedValue(null);
    const { POST } = await import("./mobile/courses/import/parse/route");
    const form = new FormData();
    form.append("text", "CHEM 201 syllabus");
    const res = await POST(postForm("/api/mobile/courses/import/parse", form));
    expect(res.status).toBe(401);
  });

  it("POST /api/mobile/courses/import/apply returns 401 without auth", async () => {
    mocks.getAuth.mockResolvedValue(null);
    const { POST } = await import("./mobile/courses/import/apply/route");
    const res = await POST(post("/api/mobile/courses/import/apply", { draft: syllabusDraft }));
    expect(res.status).toBe(401);
  });

  it("POST /api/mobile/courses/import/parse returns 400 when no file or text is sent", async () => {
    authOk();
    const { POST } = await import("./mobile/courses/import/parse/route");
    const res = await POST(postForm("/api/mobile/courses/import/parse", new FormData()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(mocks.parseSyllabus).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/courses/import/parse returns a 413 JSON error for uploads over 4.5 MB", async () => {
    authOk();
    const { POST } = await import("./mobile/courses/import/parse/route");
    const form = new FormData();
    form.append("file", new File([new Uint8Array(5 * 1024 * 1024)], "syllabus.pdf", { type: "application/pdf" }));
    const res = await POST(postForm("/api/mobile/courses/import/parse", form));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/4\.5 MB/);
    expect(mocks.parseSyllabus).not.toHaveBeenCalled();
  });

  it("POST /api/mobile/courses/import/parse returns { draft }", async () => {
    authOk();
    mocks.parseSyllabus.mockResolvedValue(syllabusDraft);
    const { POST } = await import("./mobile/courses/import/parse/route");
    const form = new FormData();
    form.append("text", "CHEM 201 syllabus");
    const res = await POST(postForm("/api/mobile/courses/import/parse", form));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: syllabusDraft });
  });

  it("POST /api/mobile/courses/import/apply returns { courseId, applied: { categories, items } }", async () => {
    const { supabase, inserted } = makeImportSupabase();
    mocks.getAuth.mockResolvedValue({ user: { id: "user-1" }, supabase });
    const { POST } = await import("./mobile/courses/import/apply/route");
    const res = await POST(post("/api/mobile/courses/import/apply", { draft: syllabusDraft }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courseId: "course-1", applied: { categories: 2, items: 2 } });
    // Dateless items are skipped; category names resolve to the inserted ids.
    expect(inserted.course_items).toEqual([
      expect.objectContaining({ course_id: "course-1", category_id: "cat-hw", title: "PS 1" }),
      expect.objectContaining({ course_id: "course-1", category_id: "cat-exam", title: "Midterm" }),
    ]);
  });

  it("serves the same runtime as the web routes", async () => {
    const parse = await import("./mobile/courses/import/parse/route");
    const apply = await import("./mobile/courses/import/apply/route");
    expect(parse.runtime).toBe((await import("./courses/parse/route")).runtime);
    expect(apply.runtime).toBe((await import("./courses/apply/route")).runtime);
  });
});

describe("mobile contract: GET /api/mobile/courses", () => {
  it("returns { courses } with nextExam on each summary", async () => {
    const rows: Record<string, unknown[]> = {
      courses: [{
        id: "course-1", user_id: "user-1", name: "Organic Chemistry", code: "CHEM 201", color: null, term: null,
        target_grade: null, archived_at: null, created_at: "2026-09-01T00:00:00Z",
      }],
      course_categories: [],
      course_items: [{
        id: "exam-1", course_id: "course-1", category_id: null, user_id: "user-1", kind: "exam", title: "Midterm",
        due_at: "2999-10-20T14:00:00Z", end_at: null, location: null, score_earned: null, score_max: 100,
        estimated_effort_hours: null, focus_mode: "continuous", created_at: "2026-09-01T00:00:00Z",
      }],
    };
    const from = vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "order"]) builder[method] = vi.fn(() => builder);
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null });
      return builder;
    });
    mocks.getAuth.mockResolvedValue({ user: { id: "user-1" }, supabase: { from } });
    const { GET } = await import("./mobile/courses/route");
    const res = (await GET(new NextRequest("http://localhost/api/mobile/courses")))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses[0]).toMatchObject({
      id: "course-1",
      nextItem: { id: "exam-1", kind: "exam" },
      nextExam: { id: "exam-1", title: "Midterm", dueAt: "2999-10-20T14:00:00Z" },
    });
  });
});
