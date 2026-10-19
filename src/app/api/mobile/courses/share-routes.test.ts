import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

type Row = Record<string, unknown>;
type Tables = Record<"courses" | "course_shares" | "course_categories" | "course_items", Row[]>;

/**
 * In-memory stand-in for the Supabase client: enough of the query builder for
 * src/lib/courses/sharing.ts, plus the two RPCs as the migration defines them
 * (course_share_template resolves only active shares of unarchived courses).
 */
function fakeDb(tables: Tables, callerId: string | null) {
  let nextId = 1;
  const uniqueChecks: Record<string, (row: Row, rows: Row[]) => boolean> = {
    course_shares: (row, rows) => rows.some((r) => r.course_id === row.course_id && r.revoked_at == null),
    courses: (row, rows) =>
      row.joined_from_share_id != null &&
      rows.some((r) => r.user_id === row.user_id && r.joined_from_share_id === row.joined_from_share_id),
  };

  function from(table: keyof Tables) {
    const filters: Array<(row: Row) => boolean> = [];
    let op: { kind: "select" } | { kind: "insert"; rows: Row[] } | { kind: "update"; patch: Row } | { kind: "delete" } = {
      kind: "select",
    };
    let mode: "many" | "single" | "maybe" = "many";

    function run(): { data: unknown; error: { code?: string; message: string } | null } {
      const rows = tables[table];
      if (op.kind === "insert") {
        const inserted: Row[] = [];
        for (const raw of op.rows) {
          if (uniqueChecks[table]?.(raw, rows)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          const row = { id: `${table}-${nextId++}`, created_at: "2026-10-19T12:00:00Z", revoked_at: null, ...raw };
          rows.push(row);
          inserted.push(row);
        }
        return { data: mode === "many" ? inserted : inserted[0] ?? null, error: null };
      }
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (op.kind === "update") for (const row of matched) Object.assign(row, op.patch);
      if (op.kind === "delete") tables[table] = rows.filter((row) => !matched.includes(row));
      if (mode === "many") return { data: matched, error: null };
      return { data: matched[0] ?? null, error: null };
    }

    const builder = {
      select: () => builder,
      insert: (rows: Row | Row[]) => ((op = { kind: "insert", rows: Array.isArray(rows) ? rows : [rows] }), builder),
      update: (patch: Row) => ((op = { kind: "update", patch }), builder),
      delete: () => ((op = { kind: "delete" }), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
      single: () => ((mode = "single"), builder),
      maybeSingle: () => ((mode = "maybe"), builder),
      then: (resolve: (value: unknown) => unknown) => resolve(run()),
    };
    return builder;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === "course_share_join_count") {
      const shareIds = tables.course_shares
        .filter((s) => s.course_id === args.target_course_id && s.user_id === callerId)
        .map((s) => s.id);
      return { data: tables.courses.filter((c) => shareIds.includes(c.joined_from_share_id)).length, error: null };
    }
    const share = tables.course_shares.find((s) => s.token === args.share_token && s.revoked_at == null);
    const course = share && tables.courses.find((c) => c.id === share.course_id && c.archived_at == null);
    if (!share || !course) return { data: null, error: null };
    const categories = tables.course_categories.filter((c) => c.course_id === course.id);
    if (name === "join_course_share") return { data: joinShare(share, course, categories), error: null };
    return {
      data: {
        ownCourseId: share.user_id === callerId ? course.id : null,
        course: { name: course.name, code: course.code, term: course.term },
        categories: categories.map((c) => ({ name: c.name, weight: c.weight })),
        items: tables.course_items
          .filter((i) => i.course_id === course.id)
          .map((i) => ({
            kind: i.kind, title: i.title, dueAt: i.due_at, endAt: i.end_at, scoreMax: i.score_max,
            estimatedEffortHours: i.estimated_effort_hours,
            categoryIndex: categories.findIndex((c) => c.id === i.category_id) >= 0
              ? categories.findIndex((c) => c.id === i.category_id) : null,
          })),
      },
      error: null,
    };
  }

  // Mirrors join_course_share: owner gets their course, a repeat join gets the first copy.
  function joinShare(share: Row, course: Row, categories: Row[]) {
    const items = tables.course_items.filter((i) => i.course_id === course.id);
    if (share.user_id === callerId) return { courseId: course.id, created: false, itemCount: items.length };
    const existing = tables.courses.find((c) => c.user_id === callerId && c.joined_from_share_id === share.id);
    if (existing) return { courseId: existing.id, created: false, itemCount: items.length };
    const courseId = `courses-${nextId++}`;
    tables.courses.push({
      id: courseId, user_id: callerId, name: course.name, code: course.code, term: course.term,
      archived_at: null, joined_from_share_id: share.id,
    });
    const copied = categories.map((c, position) => {
      const row = { id: `course_categories-${nextId++}`, course_id: courseId, user_id: callerId, name: c.name, weight: c.weight, position };
      tables.course_categories.push(row);
      return [c.id, row.id] as const;
    });
    const categoryIds = new Map<unknown, string>(copied);
    for (const i of items) {
      tables.course_items.push({
        id: `course_items-${nextId++}`, course_id: courseId, user_id: callerId, category_id: categoryIds.get(i.category_id) ?? null,
        kind: i.kind, title: i.title, due_at: i.due_at, end_at: i.end_at, score_max: i.score_max,
        estimated_effort_hours: i.estimated_effort_hours,
      });
    }
    return { courseId, created: true, itemCount: items.length };
  }

  return { from, rpc };
}

const TOKEN = "AbC_def-1234567890xyzQ";
const COURSE_ID = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";

function seed(): Tables {
  return {
    courses: [{
      id: COURSE_ID, user_id: "owner", name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026",
      target_grade: 92, archived_at: null, joined_from_share_id: null,
    }],
    course_shares: [{ id: "share-1", course_id: COURSE_ID, user_id: "owner", token: TOKEN, revoked_at: null, created_at: "2026-10-01T00:00:00Z" }],
    course_categories: [
      { id: "cat-hw", course_id: COURSE_ID, user_id: "owner", name: "Homework", weight: 40, position: 0 },
      { id: "cat-exam", course_id: COURSE_ID, user_id: "owner", name: "Exams", weight: 60, position: 1 },
    ],
    course_items: [
      {
        id: "i1", course_id: COURSE_ID, user_id: "owner", category_id: "cat-hw", kind: "assignment", title: "PS 1",
        due_at: "2026-10-01T16:00:00Z", end_at: null, score_max: 10, estimated_effort_hours: 2, score_earned: 9, location: "Online",
      },
      {
        id: "i2", course_id: COURSE_ID, user_id: "owner", category_id: "cat-exam", kind: "exam", title: "Midterm",
        due_at: "2026-10-20T14:00:00Z", end_at: "2026-10-20T16:00:00Z", score_max: 100, estimated_effort_hours: null, score_earned: null, location: null,
      },
    ],
  };
}

let tables: Tables;
function signInAs(userId: string | null) {
  getAuthMock.mockResolvedValue(userId ? { user: { id: userId }, supabase: fakeDb(tables, userId) } : null);
}

function postJoin(body: unknown) {
  return new NextRequest("http://localhost/api/mobile/courses/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function join(body: unknown) {
  const { POST } = await import("./join/route");
  return POST(postJoin(body));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://atlas.example");
  tables = seed();
});

describe("POST /api/mobile/courses/join", () => {
  it("returns 401 without auth", async () => {
    signInAs(null);
    const res = await join({ token: TOKEN });
    expect(res.status).toBe(401);
  });

  it("returns the same 404 for unknown, malformed and revoked links", async () => {
    signInAs("classmate");
    const unknown = await join({ token: "Zz_unknown-1234567890xy" });
    const malformed = await join({ token: "../etc" });
    tables.course_shares[0].revoked_at = "2026-10-10T00:00:00Z";
    const revoked = await join({ token: TOKEN });
    for (const res of [unknown, malformed, revoked]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "This course link isn't active." });
    }
    expect(tables.courses).toHaveLength(1);
  });

  it("404s once the shared course is archived", async () => {
    signInAs("classmate");
    tables.courses[0].archived_at = "2026-10-10T00:00:00Z";
    expect((await join({ token: TOKEN })).status).toBe(404);
  });

  it("copies the template into a new course the classmate owns", async () => {
    signInAs("classmate");
    const res = await join({ token: TOKEN });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ courseId: expect.any(String), created: true, itemCount: 2 });

    const course = tables.courses.find((c) => c.id === body.courseId)!;
    expect(course).toMatchObject({
      user_id: "classmate", name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026", joined_from_share_id: "share-1",
    });
    expect(course).not.toHaveProperty("target_grade");
    const categories = tables.course_categories.filter((c) => c.course_id === body.courseId);
    expect(categories.map((c) => [c.name, c.weight, c.position, c.user_id])).toEqual([
      ["Homework", 40, 0, "classmate"],
      ["Exams", 60, 1, "classmate"],
    ]);
    const items = tables.course_items.filter((i) => i.course_id === body.courseId);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.user_id).toBe("classmate");
      expect(item).not.toHaveProperty("score_earned");
      expect(item).not.toHaveProperty("location");
    }
    expect(items.find((i) => i.title === "Midterm")).toMatchObject({
      kind: "exam", category_id: categories[1].id, due_at: "2026-10-20T14:00:00Z", end_at: "2026-10-20T16:00:00Z",
    });
    expect(items.find((i) => i.title === "PS 1")).toMatchObject({ category_id: categories[0].id, score_max: 10, estimated_effort_hours: 2 });
    expect(revalidatePathMock).toHaveBeenCalledWith("/courses");
  });

  it("returns the existing course when the same share is joined twice", async () => {
    signInAs("classmate");
    const first = await (await join({ token: TOKEN })).json();
    const second = await join({ token: TOKEN });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ courseId: first.courseId, created: false, itemCount: 2 });
    expect(tables.courses.filter((c) => c.user_id === "classmate")).toHaveLength(1);
  });

  it("hides database errors behind a generic 500", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getAuthMock.mockResolvedValue({
      user: { id: "classmate" },
      supabase: { rpc: async () => ({ data: null, error: { message: "permission denied for table course_shares" } }) },
    });
    const res = await join({ token: TOKEN });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to add course." });
    errorSpy.mockRestore();
  });

  it("sends the owner to their own course instead of copying it", async () => {
    signInAs("owner");
    const res = await join({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courseId: COURSE_ID, created: false, itemCount: 2 });
    expect(tables.courses).toHaveLength(1);
  });
});

describe("GET /api/mobile/courses/join/[token]", () => {
  async function preview(token: string) {
    const { GET } = await import("./join/[token]/route");
    return GET(new NextRequest(`http://localhost/api/mobile/courses/join/${token}`), { params: Promise.resolve({ token }) });
  }

  it("previews an active share for signed-out visitors", async () => {
    signInAs(null);
    createClientMock.mockResolvedValue(fakeDb(tables, null));
    const res = await preview(TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ownCourseId).toBeNull();
    expect(body.preview).toMatchObject({
      course: { name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026" },
      counts: { exam: 1, quiz: 0, assignment: 1 },
      categoryCount: 2,
    });
    expect(JSON.stringify(body)).not.toMatch(/owner|share-1|92|Online/);
  });

  it("404s a revoked share", async () => {
    signInAs(null);
    createClientMock.mockResolvedValue(fakeDb(tables, null));
    tables.course_shares[0].revoked_at = "2026-10-10T00:00:00Z";
    expect((await preview(TOKEN)).status).toBe(404);
  });
});

describe("/api/mobile/courses/[id]/share", () => {
  async function call(method: "GET" | "POST" | "DELETE", id = COURSE_ID) {
    const route = await import("./[id]/share/route");
    const response = await route[method](new NextRequest(`http://localhost/api/mobile/courses/${id}/share`, { method }), {
      params: Promise.resolve({ id }),
    });
    if (!response) throw new Error("Route returned no response.");
    return response;
  }

  it("returns 401 without auth", async () => {
    signInAs(null);
    expect((await call("POST")).status).toBe(401);
  });

  it("reuses the active link and reports joins", async () => {
    signInAs("classmate");
    await join({ token: TOKEN });
    signInAs("owner");
    const res = await call("POST");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      created: false,
      share: { url: `https://atlas.example/join/${TOKEN}`, createdAt: "2026-10-01T00:00:00Z", joinedCount: 1 },
    });
  });

  it("stops sharing, then creates a fresh unguessable link", async () => {
    signInAs("owner");
    expect(await (await call("DELETE")).json()).toEqual({ ok: true });
    expect(await (await call("GET")).json()).toEqual({ share: null });

    const res = await call("POST");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
    const token = body.share.url.replace("https://atlas.example/join/", "");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(token).not.toBe(TOKEN);
    expect(tables.course_shares.filter((s) => s.revoked_at == null)).toHaveLength(1);
  });

  it("404s a course the caller doesn't own", async () => {
    signInAs("classmate");
    const res = await call("POST");
    expect(res.status).toBe(404);
    expect(tables.course_shares).toHaveLength(1);
  });

  it("404s a malformed course id without querying", async () => {
    signInAs("owner");
    const res = await call("POST", "not-a-uuid");
    expect(res.status).toBe(404);
    expect(tables.course_shares).toHaveLength(1);
  });

  it("logs database errors instead of returning them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = {
      from: () => {
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "maybeSingle"]) builder[m] = () => builder;
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'relation "secret_table" does not exist' } });
        return builder;
      },
    };
    getAuthMock.mockResolvedValue({ user: { id: "owner" }, supabase: failing });
    const res = await call("GET");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to load share." });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("won't share an archived course", async () => {
    signInAs("owner");
    tables.course_shares[0].revoked_at = "2026-10-10T00:00:00Z";
    tables.courses[0].archived_at = "2026-10-10T00:00:00Z";
    expect((await call("POST")).status).toBe(400);
  });
});
