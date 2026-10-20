import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Call = { method: string; args: unknown[] };
/** A table's answer: one result for every query, a queue consumed in order, or a function of the query's calls. */
type TableResult = Result | Result[] | ((calls: Call[]) => Result);

/** Chainable Supabase mock: each from() builder records its calls and resolves once (await, single or maybeSingle). */
function supabaseMock(results: Record<string, TableResult>) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const empty: Result = { data: null, error: null };
  const client = {
    from(table: string) {
      const query = { table, calls: [] as Call[] };
      queries.push(query);
      const resolve = (): Result => {
        const entry = results[table];
        if (typeof entry === "function") return entry(query.calls);
        if (Array.isArray(entry)) return entry.shift() ?? empty;
        return entry ?? empty;
      };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "not", "gte", "order", "insert", "update", "delete"]) {
        builder[method] = (...args: unknown[]) => {
          query.calls.push({ method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => resolve();
      builder.single = async () => resolve();
      builder.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected);
      return builder;
    },
  };
  const callsOf = (table: string, method: string) =>
    queries.filter((query) => query.table === table).flatMap((query) => query.calls.filter((call) => call.method === method));
  return { client, queries, callsOf };
}

function request(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = "http://localhost/api/mobile/study-sessions";
const USER = "user-1";
const COURSE = "11111111-1111-4111-8111-111111111111";
const OTHER_COURSE = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
// The profile timezone is UTC in these mocks, so "today" is the UTC date.
const today = new Date().toISOString().slice(0, 10);
const profile = { data: { timezone: "UTC" }, error: null };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION,
    course_id: COURSE,
    course_item_id: null,
    started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    ended_at: null,
    duration_minutes: null,
    source: "timer",
    study_date: today,
    plan_item_key: null,
    plan_date: null,
    auto_stopped: false,
    ...overrides,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function signIn(client: unknown) {
  getAuthMock.mockResolvedValue({ supabase: client, user: { id: USER } });
}

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockResolvedValue(null);
  });

  it("returns 401 on every route when unauthenticated", async () => {
    const start = await import("./route");
    const current = await import("./current/route");
    const summary = await import("./summary/route");
    const manual = await import("./manual/route");
    const discard = await import("./[id]/route");
    const stop = await import("./[id]/stop/route");
    expect((await start.POST(request("POST", base, {}))).status).toBe(401);
    expect((await current.GET(request("GET", `${base}/current`))).status).toBe(401);
    expect((await summary.GET(request("GET", `${base}/summary`))).status).toBe(401);
    expect((await manual.POST(request("POST", `${base}/manual`, { date: today, minutes: 30 }))).status).toBe(401);
    expect((await discard.DELETE(request("DELETE", `${base}/${SESSION}`), params(SESSION))).status).toBe(401);
    expect((await stop.POST(request("POST", `${base}/${SESSION}/stop`), params(SESSION))).status).toBe(401);
  });
});

describe("POST /api/mobile/study-sessions (start)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a malformed body", async () => {
    signIn(supabaseMock({}).client);
    const { POST } = await import("./route");
    expect((await POST(request("POST", base, { courseId: "nope" }))).status).toBe(400);
    expect((await POST(request("POST", base, { planItemKey: "goal:read", planDate: today }))).status).toBe(400);
  });

  it("starts a timer for a course on the student's local date", async () => {
    const mock = supabaseMock({
      user_profiles: profile,
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: [{ data: null, error: null }, { data: row(), error: null }],
    });
    signIn(mock.client);
    const { POST } = await import("./route");
    const response = await POST(request("POST", base, { courseId: COURSE }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.session).toMatchObject({ id: SESSION, courseId: COURSE, courseName: "Biology", endedAt: null, source: "timer" });
    const insert = mock.callsOf("study_sessions", "insert")[0]?.args[0];
    expect(insert).toMatchObject({ user_id: USER, course_id: COURSE, source: "timer", study_date: today, plan_item_key: null });
    expect(mock.callsOf("courses", "eq")).toContainEqual({ method: "eq", args: ["user_id", USER] });
  });

  it("starts from a Today study block, taking the course from the item", async () => {
    const mock = supabaseMock({
      user_profiles: profile,
      course_items: { data: { course_id: COURSE }, error: null },
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: [
        { data: null, error: null },
        { data: row({ course_item_id: ITEM, plan_item_key: `study:${ITEM}`, plan_date: today }), error: null },
      ],
    });
    signIn(mock.client);
    const { POST } = await import("./route");
    const response = await POST(request("POST", base, { planItemKey: `study:${ITEM}`, planDate: today }));
    expect(response.status).toBe(201);
    expect(mock.callsOf("study_sessions", "insert")[0]?.args[0]).toMatchObject({
      course_id: COURSE,
      course_item_id: ITEM,
      plan_item_key: `study:${ITEM}`,
      plan_date: today,
    });
    expect(mock.callsOf("course_items", "eq")).toContainEqual({ method: "eq", args: ["user_id", USER] });
  });

  it("refuses a course or item that isn't the student's", async () => {
    const { POST } = await import("./route");
    signIn(supabaseMock({ user_profiles: profile, courses: { data: null, error: null } }).client);
    expect((await POST(request("POST", base, { courseId: COURSE }))).status).toBe(404);

    signIn(supabaseMock({ user_profiles: profile, course_items: { data: null, error: null } }).client);
    expect((await POST(request("POST", base, { courseItemId: ITEM }))).status).toBe(404);

    signIn(supabaseMock({ user_profiles: profile, course_items: { data: { course_id: OTHER_COURSE }, error: null } }).client);
    expect((await POST(request("POST", base, { courseId: COURSE, courseItemId: ITEM }))).status).toBe(400);
  });

  it("returns 409 with the running timer when one is already going", async () => {
    const mock = supabaseMock({
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: { data: row(), error: null },
    });
    signIn(mock.client);
    const { POST } = await import("./route");
    const response = await POST(request("POST", base, {}));
    expect(response.status).toBe(409);
    expect((await response.json()).running).toMatchObject({ id: SESSION, courseName: "Biology" });
    expect(mock.callsOf("study_sessions", "insert")).toHaveLength(0);
  });

  it("returns 409 when a concurrent start wins the one-running-timer index", async () => {
    const mock = supabaseMock({
      user_profiles: profile,
      study_sessions: [
        { data: null, error: null },
        { data: null, error: { message: "duplicate key", code: "23505" } },
        { data: row({ course_id: null }), error: null },
      ],
    });
    signIn(mock.client);
    const { POST } = await import("./route");
    const response = await POST(request("POST", base, {}));
    expect(response.status).toBe(409);
    expect((await response.json()).running).toMatchObject({ id: SESSION });
  });
});

describe("GET /api/mobile/study-sessions/current", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the running timer", async () => {
    signIn(supabaseMock({ courses: { data: { name: "Biology" }, error: null }, study_sessions: { data: row(), error: null } }).client);
    const { GET } = await import("./current/route");
    const body = await (await GET(request("GET", `${base}/current`))).json();
    expect(body.running).toMatchObject({ id: SESSION, courseName: "Biology" });
    expect(body.autoStopped).toBeNull();
  });

  it("caps a timer left running over 6 hours and marks it", async () => {
    const startedAt = new Date(Date.now() - 9 * 3_600_000).toISOString();
    const capped = new Date(Date.parse(startedAt) + 6 * 3_600_000).toISOString();
    const mock = supabaseMock({
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: [
        { data: row({ started_at: startedAt }), error: null },
        { data: row({ started_at: startedAt, ended_at: capped, duration_minutes: 360, auto_stopped: true }), error: null },
      ],
    });
    signIn(mock.client);
    const { GET } = await import("./current/route");
    const body = await (await GET(request("GET", `${base}/current`))).json();
    expect(body.running).toBeNull();
    expect(body.autoStopped).toMatchObject({ durationMinutes: 360, autoStopped: true, endedAt: capped });
    expect(mock.callsOf("study_sessions", "update")[0]?.args[0]).toEqual({ ended_at: capped, duration_minutes: 360, auto_stopped: true });
    expect(mock.callsOf("study_sessions", "is")).toContainEqual({ method: "is", args: ["ended_at", null] });
  });
});

describe("POST /api/mobile/study-sessions/:id/stop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for a session that isn't the student's", async () => {
    signIn(supabaseMock({ study_sessions: { data: null, error: null } }).client);
    const { POST } = await import("./[id]/stop/route");
    expect((await POST(request("POST", `${base}/${SESSION}/stop`), params(SESSION))).status).toBe(404);
    expect((await POST(request("POST", `${base}/x/stop`), params("x"))).status).toBe(404);
  });

  it("saves the whole minutes studied", async () => {
    const mock = supabaseMock({
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: [{ data: row(), error: null }, { data: row({ ended_at: new Date().toISOString(), duration_minutes: 30 }), error: null }],
    });
    signIn(mock.client);
    const { POST } = await import("./[id]/stop/route");
    const response = await POST(request("POST", `${base}/${SESSION}/stop`), params(SESSION));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ discarded: false, session: { durationMinutes: 30, courseName: "Biology" } });
    expect(mock.callsOf("study_sessions", "update")[0]?.args[0]).toMatchObject({ duration_minutes: 30, auto_stopped: false });
  });

  it("discards a session under a minute", async () => {
    const mock = supabaseMock({ study_sessions: [{ data: row({ started_at: new Date(Date.now() - 20_000).toISOString() }), error: null }] });
    signIn(mock.client);
    const { POST } = await import("./[id]/stop/route");
    const body = await (await POST(request("POST", `${base}/${SESSION}/stop`), params(SESSION))).json();
    expect(body).toEqual({ session: null, discarded: true });
    expect(mock.callsOf("study_sessions", "delete")).toHaveLength(1);
    expect(mock.callsOf("study_sessions", "update")).toHaveLength(0);
  });

  it("returns an already-stopped session unchanged", async () => {
    const ended = row({ ended_at: new Date().toISOString(), duration_minutes: 360, auto_stopped: true });
    const mock = supabaseMock({ courses: { data: { name: "Biology" }, error: null }, study_sessions: { data: ended, error: null } });
    signIn(mock.client);
    const { POST } = await import("./[id]/stop/route");
    const body = await (await POST(request("POST", `${base}/${SESSION}/stop`), params(SESSION))).json();
    expect(body).toMatchObject({ discarded: false, session: { autoStopped: true, durationMinutes: 360 } });
    expect(mock.callsOf("study_sessions", "update")).toHaveLength(0);
  });
});

describe("DELETE /api/mobile/study-sessions/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discards the student's session", async () => {
    const mock = supabaseMock({ study_sessions: { data: [{ id: SESSION }], error: null } });
    signIn(mock.client);
    const { DELETE } = await import("./[id]/route");
    const response = await DELETE(request("DELETE", `${base}/${SESSION}`), params(SESSION));
    expect(await response.json()).toEqual({ ok: true });
    expect(mock.callsOf("study_sessions", "eq")).toEqual([
      { method: "eq", args: ["user_id", USER] },
      { method: "eq", args: ["id", SESSION] },
    ]);
  });

  it("returns 404 when nothing was deleted", async () => {
    signIn(supabaseMock({ study_sessions: { data: [], error: null } }).client);
    const { DELETE } = await import("./[id]/route");
    expect((await DELETE(request("DELETE", `${base}/${SESSION}`), params(SESSION))).status).toBe(404);
  });
});

describe("POST /api/mobile/study-sessions/manual", () => {
  beforeEach(() => vi.clearAllMocks());

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const longAgo = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);

  it("logs time for a past day", async () => {
    const mock = supabaseMock({
      user_profiles: profile,
      courses: { data: { name: "Biology" }, error: null },
      study_sessions: {
        data: row({ source: "manual", study_date: yesterday, ended_at: `${yesterday}T12:45:00.000Z`, duration_minutes: 45 }),
        error: null,
      },
    });
    signIn(mock.client);
    const { POST } = await import("./manual/route");
    const response = await POST(request("POST", `${base}/manual`, { courseId: COURSE, date: yesterday, minutes: 45 }));
    expect(response.status).toBe(201);
    expect((await response.json()).session).toMatchObject({ source: "manual", durationMinutes: 45, courseName: "Biology" });
    expect(mock.callsOf("study_sessions", "insert")[0]?.args[0]).toEqual({
      user_id: USER,
      course_id: COURSE,
      started_at: `${yesterday}T12:00:00.000Z`,
      ended_at: `${yesterday}T12:45:00.000Z`,
      duration_minutes: 45,
      source: "manual",
      study_date: yesterday,
    });
  });

  it("rejects bad minutes, future days and days past the lookback", async () => {
    signIn(supabaseMock({ user_profiles: profile }).client);
    const { POST } = await import("./manual/route");
    expect((await POST(request("POST", `${base}/manual`, { date: today, minutes: 0 }))).status).toBe(400);
    expect((await POST(request("POST", `${base}/manual`, { date: today, minutes: 721 }))).status).toBe(400);
    expect((await POST(request("POST", `${base}/manual`, { date: tomorrow, minutes: 30 }))).status).toBe(400);
    expect((await POST(request("POST", `${base}/manual`, { date: longAgo, minutes: 30 }))).status).toBe(400);
  });
});

describe("GET /api/mobile/study-sessions/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a malformed courseId", async () => {
    signIn(supabaseMock({}).client);
    const { GET } = await import("./summary/route");
    expect((await GET(request("GET", `${base}/summary?courseId=abc`))).status).toBe(400);
  });

  it("summarizes this week's study and the course total", async () => {
    const mock = supabaseMock({
      user_profiles: profile,
      courses: { data: [{ id: COURSE, name: "Biology" }], error: null },
      study_sessions: (calls) => {
        const select = String(calls.find((call) => call.method === "select")?.args[0] ?? "");
        if (calls.some((call) => call.method === "is")) return { data: null, error: null }; // no running timer
        if (select === "duration_minutes") return { data: [{ duration_minutes: 200 }, { duration_minutes: 60 }], error: null };
        return {
          data: [
            { course_id: COURSE, study_date: today, duration_minutes: 50 },
            { course_id: null, study_date: today, duration_minutes: 10 },
          ],
          error: null,
        };
      },
    });
    signIn(mock.client);
    const { GET } = await import("./summary/route");
    const response = await GET(request("GET", `${base}/summary?courseId=${COURSE}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      today,
      todayMinutes: 60,
      weekTotalMinutes: 60,
      streakDays: 1,
      running: null,
      autoStopped: null,
      courseTotalMinutes: 260,
    });
    expect(body.weekByCourse).toEqual([
      { courseId: COURSE, courseName: "Biology", minutes: 50 },
      { courseId: null, courseName: null, minutes: 10 },
    ]);
    expect(body.last7Days).toHaveLength(7);
    expect(mock.callsOf("study_sessions", "not")).toContainEqual({ method: "not", args: ["ended_at", "is", null] });
  });

  it("returns 500 when the read fails", async () => {
    signIn(supabaseMock({ study_sessions: { data: null, error: { message: "boom" } } }).client);
    const { GET } = await import("./summary/route");
    expect((await GET(request("GET", `${base}/summary`))).status).toBe(500);
  });
});
