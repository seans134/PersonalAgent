import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LmsFeedFetchError } from "@/lib/lms-feed/fetch-feed";

const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), fetchFeed: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: mocks.getAuth }));
vi.mock("@/lib/lms-feed/fetch-feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/lms-feed/fetch-feed")>()),
  fetchLmsFeed: mocks.fetchFeed,
}));

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * A small in-memory Supabase: enough of the query builder for the LMS feed code (eq/is/in/or
 * filters, order/range/limit, insert/upsert/update/delete with select). Deleting a course item
 * nulls lms_feed_items.course_item_id and marks the row removed, like the migration's FK + trigger.
 */
type Hooks = {
  /** Runs before an insert into `table` is applied (to simulate a concurrent request). */
  beforeInsert?: (table: string) => void;
  /** Tables whose upserts fail (to simulate a database error). */
  failUpsert?: string[];
};

function memorySupabase(tables: Tables, hooks: Hooks = {}) {
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

  function from(table: string) {
    tables[table] ??= [];
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let conflict: string[] = [];
    let ignoreDuplicates = false;
    let order: { column: string; ascending: boolean } | null = null;
    let range: [number, number] | null = null;
    let limit: number | null = null;

    const run = (): { data: unknown; error: null } => {
      const rows = tables[table];
      const matches = () => rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === "insert" || op === "upsert") {
        if (op === "upsert" && hooks.failUpsert?.includes(table)) return { data: null, error: { message: "boom" } } as never;
        if (op === "insert") hooks.beforeInsert?.(table);
        const out: Row[] = [];
        for (const input of Array.isArray(payload) ? payload : [payload!]) {
          const existing = op === "upsert" ? rows.find((row) => conflict.every((column) => row[column] === input[column])) : undefined;
          if (existing && ignoreDuplicates) continue;
          if (existing) {
            Object.assign(existing, input);
            out.push(existing);
          } else {
            const row = { id: nextId(), ...input };
            rows.push(row);
            out.push(row);
          }
        }
        return { data: out, error: null };
      }
      if (op === "update") {
        const hit = matches();
        for (const row of hit) Object.assign(row, payload);
        return { data: hit, error: null };
      }
      if (op === "delete") {
        const hit = matches();
        tables[table] = rows.filter((row) => !hit.includes(row));
        if (table === "course_items") {
          for (const mapping of tables.lms_feed_items ?? []) {
            if (hit.some((row) => row.id === mapping.course_item_id)) {
              mapping.course_item_id = null;
              if (mapping.status === "imported") mapping.status = "removed";
            }
          }
        }
        return { data: hit, error: null };
      }
      let hit = matches();
      if (order) {
        const { column, ascending } = order;
        hit = [...hit].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
      }
      if (range) hit = hit.slice(range[0], range[1] + 1);
      if (limit !== null) hit = hit.slice(0, limit);
      return { data: hit.map((row) => ({ ...row })), error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (value: Row | Row[]) => ((op = "insert"), (payload = value), builder),
      upsert: (value: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => (
        (op = "upsert"),
        (payload = value),
        (conflict = (options?.onConflict ?? "id").split(",")),
        (ignoreDuplicates = Boolean(options?.ignoreDuplicates)),
        builder
      ),
      update: (value: Row) => ((op = "update"), (payload = value), builder),
      delete: () => ((op = "delete"), builder),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), builder),
      in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
      or: (expression: string) => {
        // Only the sync claim's "col.is.null,col.lt."iso"" form.
        const match = /^(\w+)\.is\.null,\1\.lt\."(.+)"$/.exec(expression);
        if (!match) throw new Error(`unsupported or(): ${expression}`);
        const [, column, iso] = match;
        filters.push((row) => row[column] == null || String(row[column]) < iso);
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => ((order = { column, ascending: options?.ascending ?? true }), builder),
      range: (start: number, end: number) => ((range = [start, end]), builder),
      limit: (value: number) => ((limit = value), builder),
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as Row[])[0] ?? null, error: null };
      },
      single: async () => {
        const { data } = run();
        return { data: (data as Row[])[0] ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  }

  return { from };
}

const USER = "user-1";
const SECRET = "https://canvas.example.edu/feeds/calendars/user_SECRETTOKEN123.ics";
const CS = "11111111-1111-4111-8111-111111111111";
const BIO = "22222222-2222-4222-8222-222222222222";

function feed(events: Array<{ uid: string; summary: string; start: string }>) {
  const body = events
    .map((event) => [`BEGIN:VEVENT`, `UID:${event.uid}`, `SUMMARY:${event.summary}`, `DTSTART:${event.start}`, `DTEND:${event.start}`, `END:VEVENT`].join("\r\n"))
    .join("\r\n");
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

// Dates relative to now so the import window always includes them.
function utcIn(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
const due1 = utcIn(3);
const due2 = utcIn(5);
const due3 = utcIn(8);

const baseFeed = [
  { uid: "event-assignment-1", summary: "Problem Set 1 [CS 101]", start: due1 },
  { uid: "event-assignment-2", summary: "Lab report [PHYS 120]", start: due2 },
  { uid: "event-calendar-event-3", summary: "Office Hours [CS 101]", start: due3 },
];

let tables: Tables;

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/mobile/lms-feed${path}`, {
    method,
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tables = {
    courses: [
      { id: CS, user_id: USER, name: "Intro to Programming", code: "CS 101", archived_at: null },
      { id: BIO, user_id: USER, name: "Biology", code: "BIO 150", archived_at: null },
    ],
    user_profiles: [{ user_id: USER, timezone: "America/Toronto" }],
    course_items: [],
    lms_feeds: [],
    lms_feed_items: [],
  };
  mocks.getAuth.mockResolvedValue({ user: { id: USER }, supabase: memorySupabase(tables) });
  mocks.fetchFeed.mockResolvedValue(feed(baseFeed));
});

/** Lets the next manual sync past the one-minute throttle. */
function ageLastAttempt() {
  tables.lms_feeds[0].last_attempt_at = new Date(Date.now() - 5 * 60_000).toISOString();
}

describe("/api/mobile/lms-feed", () => {
  it("requires auth", async () => {
    mocks.getAuth.mockResolvedValue(null);
    const { GET, PUT } = await import("./route");
    expect((await GET(request("GET", ""))).status).toBe(401);
    expect((await PUT(request("PUT", "", { url: SECRET }))).status).toBe(401);
  });

  it("connects, imports matched deadlines, holds unmatched ones, and never returns the link", async () => {
    const { PUT, GET } = await import("./route");
    const res = await PUT(request("PUT", "", { url: SECRET.replace("https://", "webcal://") }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("SECRETTOKEN");
    const body = JSON.parse(text);
    expect(body.synced).toBe(true);
    expect(body.counts).toEqual({ events: 3, deadlines: 2, added: 1, updated: 0, needsCourse: 1 });
    expect(body.feed).toMatchObject({ maskedUrl: "https://canvas.example.edu/••••••", provider: "canvas", stale: false, lastError: null });
    expect(body.needsCourse).toEqual([expect.objectContaining({ title: "Lab report", courseHint: "PHYS 120", kind: "assignment" })]);

    expect(mocks.fetchFeed).toHaveBeenCalledWith(SECRET);
    expect(tables.lms_feeds[0].feed_url).toBe(SECRET);
    expect(tables.course_items).toEqual([
      expect.objectContaining({ user_id: USER, course_id: CS, kind: "assignment", title: "Problem Set 1", end_at: null }),
    ]);

    const status = await (await GET(request("GET", ""))).text();
    expect(status).not.toContain("SECRETTOKEN");
  });

  it("doesn't save a link that fails, and reports a code without the link", async () => {
    mocks.fetchFeed.mockRejectedValue(new LmsFeedFetchError("blocked_address"));
    const { PUT } = await import("./route");
    const res = await PUT(request("PUT", "", { url: SECRET }));
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain("SECRETTOKEN");
    expect(JSON.parse(text)).toMatchObject({ code: "blocked_address" });
    // The attempt is recorded (for the throttle) but the link is not.
    expect(tables.lms_feeds).toEqual([expect.objectContaining({ user_id: USER, feed_url: null })]);
    expect(JSON.stringify(tables)).not.toContain("SECRETTOKEN");
    const { GET } = await import("./route");
    expect(await (await GET(request("GET", ""))).json()).toEqual({ feed: null, needsCourse: [] });

    const invalid = await PUT(request("PUT", "", { url: "http://canvas.example.edu/x.ics" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "invalid_url" });

    mocks.fetchFeed.mockResolvedValue("<html>login</html>");
    ageLastAttempt();
    const html = await PUT(request("PUT", "", { url: SECRET }));
    expect(await html.json()).toMatchObject({ code: "not_calendar" });
  });

  it("re-syncs idempotently, updates changed due dates, and never brings back deleted items", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    await PUT(request("PUT", "", { url: SECRET }));
    const firstItemId = tables.course_items[0].id;

    // Same feed again: nothing new.
    ageLastAttempt();
    let res = await POST(request("POST", "/sync", {}));
    expect((await res.json()).counts).toMatchObject({ added: 0, updated: 0, needsCourse: 1 });
    expect(tables.course_items).toHaveLength(1);
    expect(tables.lms_feed_items).toHaveLength(2);

    // The LMS moves the due date: the same item is updated in place.
    const moved = utcIn(4);
    mocks.fetchFeed.mockResolvedValue(feed([{ ...baseFeed[0], start: moved }, baseFeed[1]]));
    ageLastAttempt();
    res = await POST(request("POST", "/sync", {}));
    expect((await res.json()).counts).toMatchObject({ added: 0, updated: 1 });
    expect(tables.course_items).toHaveLength(1);
    expect(tables.course_items[0].id).toBe(firstItemId);
    expect(new Date(String(tables.course_items[0].due_at)).getTime()).toBeGreaterThan(
      new Date(Date.now() + 3.5 * 86_400_000).getTime(),
    );

    // The student deletes the item in Atlas: the next sync doesn't re-create it.
    tables.course_items = [];
    for (const mapping of tables.lms_feed_items) {
      if (mapping.course_item_id === firstItemId) {
        mapping.course_item_id = null;
        mapping.status = "removed";
      }
    }
    ageLastAttempt();
    res = await POST(request("POST", "/sync", {}));
    expect((await res.json()).counts).toMatchObject({ added: 0 });
    expect(tables.course_items).toEqual([]);
  });

  it("only auto-syncs when stale, and throttles manual syncs", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    await PUT(request("PUT", "", { url: SECRET }));
    mocks.fetchFeed.mockClear();

    let res = await POST(request("POST", "/sync", { ifStale: true }));
    expect(await res.json()).toMatchObject({ synced: false, counts: null });
    expect(mocks.fetchFeed).not.toHaveBeenCalled();

    res = await POST(request("POST", "/sync", {}));
    expect(res.status).toBe(429);

    tables.lms_feeds[0].last_synced_at = new Date(Date.now() - 13 * 3_600_000).toISOString();
    ageLastAttempt();
    res = await POST(request("POST", "/sync", { ifStale: true }));
    expect(await res.json()).toMatchObject({ synced: true });
    expect(mocks.fetchFeed).toHaveBeenCalledTimes(1);
  });

  it("records a failed sync's code and answers 422 without the link", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    await PUT(request("PUT", "", { url: SECRET }));
    mocks.fetchFeed.mockRejectedValue(new Error(`getaddrinfo ENOTFOUND for ${SECRET}`));
    ageLastAttempt();
    const res = await POST(request("POST", "/sync", {}));
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain("SECRETTOKEN");
    expect(JSON.parse(text)).toMatchObject({ code: "unreachable" });
    expect(tables.lms_feeds[0].last_error).toBe("unreachable");
  });

  it("assigns a waiting deadline to a course, and later events with the same tag follow it", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    const { PATCH } = await import("./items/[id]/route");
    await PUT(request("PUT", "", { url: SECRET }));
    const pending = tables.lms_feed_items.find((row) => row.status === "needs_course")!;

    const res = await PATCH(request("PATCH", `/items/${pending.id}`, { action: "assign", courseId: BIO, kind: "exam" }), {
      params: Promise.resolve({ id: String(pending.id) }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).needsCourse).toEqual([]);
    expect(tables.course_items).toContainEqual(expect.objectContaining({ course_id: BIO, title: "Lab report", kind: "exam" }));

    // Handling it twice is a 404.
    const again = await PATCH(request("PATCH", `/items/${pending.id}`, { action: "skip" }), {
      params: Promise.resolve({ id: String(pending.id) }),
    });
    expect(again.status).toBe(404);

    mocks.fetchFeed.mockResolvedValue(feed([...baseFeed, { uid: "event-assignment-9", summary: "Lab report 2 [PHYS 120]", start: due3 }]));
    ageLastAttempt();
    const sync = await POST(request("POST", "/sync", {}));
    expect((await sync.json()).counts).toMatchObject({ added: 1, needsCourse: 0 });
    expect(tables.course_items).toContainEqual(expect.objectContaining({ course_id: BIO, title: "Lab report 2" }));
  });

  it("skips a waiting deadline for good", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    const { PATCH } = await import("./items/[id]/route");
    await PUT(request("PUT", "", { url: SECRET }));
    const pending = tables.lms_feed_items.find((row) => row.status === "needs_course")!;
    await PATCH(request("PATCH", `/items/${pending.id}`, { action: "skip" }), { params: Promise.resolve({ id: String(pending.id) }) });
    ageLastAttempt();
    const body = await (await POST(request("POST", "/sync", {}))).json();
    expect(body.needsCourse).toEqual([]);
    expect(body.counts.needsCourse).toBe(0);
  });

  it("disconnects but keeps imported items", async () => {
    const { PUT, DELETE, GET } = await import("./route");
    await PUT(request("PUT", "", { url: SECRET }));
    const res = await DELETE(request("DELETE", ""));
    expect(await res.json()).toEqual({ ok: true });
    // The link is gone but the row (and its throttle) stays.
    expect(tables.lms_feeds).toEqual([expect.objectContaining({ feed_url: null, last_synced_at: null })]);
    expect(tables.course_items).toHaveLength(1);
    expect(tables.lms_feed_items.map((row) => row.status)).toEqual(["imported"]);
    expect(await (await GET(request("GET", ""))).json()).toEqual({ feed: null, needsCourse: [] });
    const { POST } = await import("./sync/route");
    expect((await POST(request("POST", "/sync", {}))).status).toBe(404);
    // Reconnecting right away is throttled like a sync; after a minute it works without duplicates.
    expect((await PUT(request("PUT", "", { url: SECRET }))).status).toBe(429);
    ageLastAttempt();
    expect((await PUT(request("PUT", "", { url: SECRET }))).status).toBe(200);
    expect(tables.course_items).toHaveLength(1);
  });

  it("throttles connects: repeated or concurrent connects fetch once and never duplicate items", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    const results = await Promise.all([
      PUT(request("PUT", "", { url: SECRET })),
      PUT(request("PUT", "", { url: SECRET })),
      POST(request("POST", "/sync", {})),
    ]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(mocks.fetchFeed).toHaveBeenCalledTimes(1);
    expect(tables.course_items).toHaveLength(1);

    const again = await PUT(request("PUT", "", { url: SECRET }));
    expect(again.status).toBe(429);
    expect(mocks.fetchFeed).toHaveBeenCalledTimes(1);
  });

  it("keeps the old link when a replacement link fails", async () => {
    const { PUT } = await import("./route");
    await PUT(request("PUT", "", { url: SECRET }));
    mocks.fetchFeed.mockRejectedValue(new LmsFeedFetchError("rejected"));
    ageLastAttempt();
    const res = await PUT(request("PUT", "", { url: "https://canvas.example.edu/feeds/calendars/user_OTHER.ics" }));
    expect(res.status).toBe(422);
    expect(tables.lms_feeds[0].feed_url).toBe(SECRET);
  });

  it("doesn't overwrite a waiting deadline the student skips during a sync", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    await PUT(request("PUT", "", { url: SECRET }));
    const pending = tables.lms_feed_items.find((row) => row.status === "needs_course")!;
    // A PHYS course now exists, so the sync wants to import the waiting deadline...
    tables.courses.push({ id: "33333333-3333-4333-8333-333333333333", user_id: USER, name: "Physics", code: "PHYS 120", archived_at: null });
    // ...but the student skips it on another device while the sync is writing.
    mocks.getAuth.mockResolvedValue({
      user: { id: USER },
      supabase: memorySupabase(tables, {
        beforeInsert: (table) => {
          if (table === "course_items") pending.status = "skipped";
        },
      }),
    });
    ageLastAttempt();
    const body = await (await POST(request("POST", "/sync", {}))).json();
    expect(body.counts).toMatchObject({ added: 0, needsCourse: 0 });
    expect(pending.status).toBe("skipped");
    expect(pending.course_item_id ?? null).toBeNull();
    expect(tables.course_items.map((item) => item.title)).toEqual(["Problem Set 1"]);
  });

  it("records database failures as internal, not as a feed problem", async () => {
    const { PUT } = await import("./route");
    const { POST } = await import("./sync/route");
    await PUT(request("PUT", "", { url: SECRET }));
    mocks.fetchFeed.mockResolvedValue(feed([...baseFeed, { uid: "event-assignment-7", summary: "HW 7 [CS 101]", start: due3 }]));
    mocks.getAuth.mockResolvedValue({ user: { id: USER }, supabase: memorySupabase(tables, { failUpsert: ["lms_feed_items"] }) });
    ageLastAttempt();
    const res = await POST(request("POST", "/sync", {}));
    expect(res.status).toBe(500);
    expect(tables.lms_feeds[0].last_error).toBe("internal");
    // The new item was rolled back.
    expect(tables.course_items.map((item) => item.title)).toEqual(["Problem Set 1"]);
  });

  it("validates PATCH bodies and ids", async () => {
    const { PATCH } = await import("./items/[id]/route");
    const id = "33333333-3333-4333-8333-333333333333";
    expect((await PATCH(request("PATCH", `/items/${id}`, { action: "nope" }), { params: Promise.resolve({ id }) })).status).toBe(400);
    expect((await PATCH(request("PATCH", "/items/x", { action: "skip" }), { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
  });
});
