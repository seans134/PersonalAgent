/**
 * Atlas Pro routes: the Stripe and RevenueCat webhooks (signature / auth checks, idempotency,
 * entitlement upserts), GET /api/mobile/subscription, and the free-tier limit on syllabus import.
 * Supabase is an in-memory store shared by the "student" client and the service-role client.
 */
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  createAdmin: vi.fn(),
  retrieveSubscription: vi.fn(),
  parseSyllabus: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: mocks.getAuth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdmin }));
vi.mock("@/lib/courses/syllabus-parse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/courses/syllabus-parse")>()),
  parseSyllabus: mocks.parseSyllabus,
}));
// Real signature verification (Stripe.webhooks); only the API call to read a subscription is faked.
vi.mock("@/lib/subscription/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/subscription/stripe")>()),
  getStripe: () =>
    process.env.STRIPE_SECRET_KEY
      ? { webhooks: Stripe.webhooks, subscriptions: { retrieve: mocks.retrieveSubscription } }
      : null,
}));

type Row = Record<string, unknown>;

/** Enough of the Supabase query builder for the subscription code. billing_webhook_events.id is unique. */
function memoryDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const writes: Array<{ table: string; op: string }> = [];

  function from(table: string) {
    tables[table] ??= [];
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "insert" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let conflict = "id";
    let single = false;

    const run = () => {
      const rows = tables[table];
      const matches = () => rows.filter((row) => filters.every((filter) => filter(row)));
      if (op === "insert" || op === "upsert") {
        writes.push({ table, op });
        for (const input of Array.isArray(payload) ? payload : [payload!]) {
          const existing = rows.find((row) => input[conflict] !== undefined && row[conflict] === input[conflict]);
          if (existing && op === "insert") return { data: null, error: { code: "23505", message: "duplicate key" } };
          if (existing) Object.assign(existing, input);
          else rows.push({ id: `row-${++seq}`, created_at: new Date().toISOString(), ...input });
        }
        return { data: null, error: null };
      }
      if (op === "delete") {
        writes.push({ table, op });
        tables[table] = rows.filter((row) => !matches().includes(row));
        return { data: null, error: null };
      }
      const hit = matches().map((row) => ({ ...row }));
      return { data: single ? (hit[0] ?? null) : hit, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
      gte: (column: string, value: string) => (filters.push((row) => String(row[column]) >= value), builder),
      maybeSingle: () => ((single = true), builder),
      insert: (rows: Row | Row[]) => ((op = "insert"), (payload = rows), builder),
      upsert: (rows: Row | Row[], options?: { onConflict?: string }) => (
        (op = "upsert"), (payload = rows), (conflict = options?.onConflict ?? "id"), builder
      ),
      delete: () => ((op = "delete"), builder),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        try {
          return Promise.resolve(resolve(run()));
        } catch (error) {
          return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
        }
      },
    };
    return builder;
  }

  return { db: { from }, tables, writes };
}

const USER = "11111111-2222-4333-8444-555555555555";
const STRIPE_SECRET = "whsec_test_secret";
const RC_SECRET = "rc_test_secret";

let store: ReturnType<typeof memoryDb>;

beforeEach(() => {
  vi.clearAllMocks();
  store = memoryDb({ user_entitlements: [], billing_webhook_events: [], syllabus_imports: [], user_profiles: [] });
  mocks.createAdmin.mockReturnValue(store.db);
  mocks.getAuth.mockResolvedValue({ user: { id: USER, email: "student@example.com" }, supabase: store.db });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", STRIPE_SECRET);
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_month");
  vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_year");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", RC_SECRET);
  vi.stubEnv("PRO_ENFORCE_LIMITS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---- Stripe ----

const periodEnd = Math.floor(Date.parse("2099-11-20T00:00:00Z") / 1000);

function subscription(patch: Row = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { user_id: USER },
    items: { data: [{ price: { id: "price_month" }, current_period_end: periodEnd }] },
    ...patch,
  };
}

function stripeEvent(id: string, type: string, object: unknown, created = 1_792_500_000) {
  return { id, object: "event", type, created, data: { object } };
}

async function postStripe(event: unknown, options: { secret?: string; signature?: string | null } = {}) {
  const payload = JSON.stringify(event);
  const signature =
    options.signature === undefined
      ? Stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? STRIPE_SECRET })
      : options.signature;
  const { POST } = await import("./webhooks/stripe/route");
  return POST(
    new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: signature ? { "stripe-signature": signature } : {},
      body: payload,
    }),
  );
}

const checkoutCompleted = stripeEvent("evt_checkout", "checkout.session.completed", {
  object: "checkout.session",
  mode: "subscription",
  client_reference_id: USER,
  customer: "cus_1",
  subscription: "sub_1",
});

describe("POST /api/webhooks/stripe", () => {
  it("rejects a missing or invalid signature without touching the database", async () => {
    expect((await postStripe(checkoutCompleted, { signature: null })).status).toBe(400);
    expect((await postStripe(checkoutCompleted, { secret: "whsec_wrong" })).status).toBe(400);
    expect((await postStripe(checkoutCompleted, { signature: "t=1,v1=deadbeef" })).status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it("answers 503 when Stripe isn't configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await postStripe(checkoutCompleted)).status).toBe(503);
  });

  it("grants Pro on checkout.session.completed", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    const response = await postStripe(checkoutCompleted);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "applied" });
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(store.tables.user_entitlements).toEqual([
      expect.objectContaining({
        user_id: USER,
        source: "stripe",
        status: "active",
        plan: "monthly",
        product_id: "price_month",
        current_period_end: new Date(periodEnd * 1000).toISOString(),
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
      }),
    ]);
  });

  it("applies a redelivered event id once", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    await postStripe(checkoutCompleted);
    const again = await postStripe(checkoutCompleted);
    expect(await again.json()).toEqual({ received: true, result: "duplicate" });
    expect(mocks.retrieveSubscription).toHaveBeenCalledTimes(1);
    expect(store.writes.filter((write) => write.table === "user_entitlements")).toHaveLength(1);
  });

  it("follows subscription updates and deletion, found by customer id when metadata is missing", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    await postStripe(checkoutCompleted);

    await postStripe(
      stripeEvent("evt_upd", "customer.subscription.updated", subscription({ metadata: {}, cancel_at_period_end: true }), 1_792_500_100),
    );
    expect(store.tables.user_entitlements[0]).toMatchObject({ status: "canceled" });

    await postStripe(stripeEvent("evt_del", "customer.subscription.deleted", subscription({ metadata: {}, status: "canceled" }), 1_792_500_200));
    expect(store.tables.user_entitlements[0]).toMatchObject({ status: "expired", stripe_customer_id: "cus_1" });
  });

  it("ignores an older event delivered late", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    await postStripe(checkoutCompleted);
    await postStripe(stripeEvent("evt_del", "customer.subscription.deleted", subscription({ status: "canceled" }), 1_792_500_200));
    const late = await postStripe(stripeEvent("evt_old", "customer.subscription.updated", subscription(), 1_792_500_050));
    expect(await late.json()).toEqual({ received: true, result: "skipped" });
    expect(store.tables.user_entitlements[0]).toMatchObject({ status: "expired" });
  });

  it("ignores subscriptions to prices that aren't Atlas Pro", async () => {
    mocks.retrieveSubscription.mockResolvedValue(
      subscription({ items: { data: [{ price: { id: "price_other_product" }, current_period_end: periodEnd }] } }),
    );
    expect(await (await postStripe(checkoutCompleted)).json()).toEqual({ received: true, result: "ignored" });
    const update = stripeEvent(
      "evt_other",
      "customer.subscription.updated",
      subscription({ items: { data: [{ price: { id: "price_other_product" }, current_period_end: periodEnd }] } }),
    );
    expect(await (await postStripe(update)).json()).toEqual({ received: true, result: "ignored" });
    expect(store.tables.user_entitlements).toEqual([]);
  });

  it("acknowledges and skips events whose user id isn't a Supabase id (no endless retries)", async () => {
    const bad = stripeEvent("evt_bad", "customer.subscription.updated", subscription({ metadata: { user_id: "not-a-uuid" } }));
    const response = await postStripe(bad);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(store.tables.billing_webhook_events).toHaveLength(1);
    const session = stripeEvent("evt_bad_session", "checkout.session.completed", {
      object: "checkout.session",
      mode: "subscription",
      client_reference_id: "nope",
      subscription: "sub_1",
    });
    expect(await (await postStripe(session)).json()).toEqual({ received: true, result: "ignored" });
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(store.tables.user_entitlements).toEqual([]);
  });

  it("acknowledges other event types without storing them", async () => {
    const response = await postStripe(stripeEvent("evt_x", "invoice.paid", { object: "invoice" }));
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(store.writes).toEqual([]);
  });

  it("releases the claim when applying fails so Stripe's retry runs", async () => {
    mocks.retrieveSubscription.mockRejectedValueOnce(new Error("network"));
    expect((await postStripe(checkoutCompleted)).status).toBe(500);
    expect(store.tables.billing_webhook_events).toEqual([]);
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    expect(await (await postStripe(checkoutCompleted)).json()).toEqual({ received: true, result: "applied" });
  });
});

// ---- RevenueCat ----

async function postRevenueCat(event: Row, authorization: string | null = `Bearer ${RC_SECRET}`) {
  const { POST } = await import("./webhooks/revenuecat/route");
  return POST(
    new NextRequest("http://localhost/api/webhooks/revenuecat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ api_version: "1.0", event }),
    }),
  );
}

function rcEvent(id: string, type: string, patch: Row = {}) {
  return {
    id,
    type,
    app_user_id: USER,
    product_id: "atlas_pro_yearly",
    entitlement_ids: ["pro"],
    expiration_at_ms: Date.parse("2099-10-20T00:00:00Z"),
    event_timestamp_ms: Date.parse("2026-10-20T00:00:00Z"),
    ...patch,
  };
}

describe("POST /api/webhooks/revenuecat", () => {
  it("rejects a wrong or missing Authorization header", async () => {
    expect((await postRevenueCat(rcEvent("rc_1", "INITIAL_PURCHASE"), "Bearer nope")).status).toBe(401);
    expect((await postRevenueCat(rcEvent("rc_1", "INITIAL_PURCHASE"), null)).status).toBe(401);
    expect(store.writes).toEqual([]);
  });

  it("answers 503 when no secret is configured", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", "");
    expect((await postRevenueCat(rcEvent("rc_1", "INITIAL_PURCHASE"))).status).toBe(503);
  });

  it("grants Pro on a purchase, once per event id, and ends it on expiration", async () => {
    const first = await postRevenueCat(rcEvent("rc_1", "INITIAL_PURCHASE"));
    expect(await first.json()).toEqual({ received: true, result: "applied" });
    expect(store.tables.user_entitlements).toEqual([
      expect.objectContaining({ user_id: USER, source: "revenuecat", status: "active", plan: "yearly", revenuecat_app_user_id: USER }),
    ]);

    expect(await (await postRevenueCat(rcEvent("rc_1", "INITIAL_PURCHASE"))).json()).toEqual({ received: true, result: "duplicate" });

    await postRevenueCat(rcEvent("rc_2", "EXPIRATION", { event_timestamp_ms: Date.parse("2026-10-21T00:00:00Z") }));
    expect(store.tables.user_entitlements[0]).toMatchObject({ status: "expired" });
  });

  it("acknowledges test events without writing an entitlement", async () => {
    const response = await postRevenueCat(rcEvent("rc_test", "TEST"));
    expect(await response.json()).toEqual({ received: true, result: "ignored" });
    expect(store.tables.user_entitlements).toEqual([]);
  });

  it("doesn't let an app-store expiration end an active web subscription", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    await postStripe(checkoutCompleted);
    await postRevenueCat(rcEvent("rc_exp", "EXPIRATION"));
    expect(store.tables.user_entitlements[0]).toMatchObject({ source: "stripe", status: "active", revenuecat_app_user_id: USER });
  });
});

// ---- POST /api/billing/checkout ----

describe("POST /api/billing/checkout", () => {
  async function postCheckout(plan: string) {
    const { POST } = await import("./billing/checkout/route");
    return POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      }),
    );
  }

  it("refuses a second subscription for a student who is already Pro", async () => {
    store.tables.user_entitlements.push({
      user_id: USER,
      source: "revenuecat",
      status: "active",
      plan: "yearly",
      current_period_end: "2099-01-01T00:00:00.000Z",
    });
    const response = await postCheckout("monthly");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "already_pro" });
  });

  it("answers 503 with no Stripe keys and 400 for an unknown plan", async () => {
    expect((await postCheckout("weekly")).status).toBe(400);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect((await postCheckout("monthly")).status).toBe(503);
  });
});

// ---- GET /api/mobile/subscription ----

async function getSubscription() {
  const { GET } = await import("./mobile/subscription/route");
  return GET(new NextRequest("http://localhost/api/mobile/subscription"));
}

describe("GET /api/mobile/subscription", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getAuth.mockResolvedValue(null);
    expect((await getSubscription()).status).toBe(401);
  });

  it("reports a free student's usage with limits off by default", async () => {
    store.tables.syllabus_imports.push({ user_id: USER, created_at: new Date().toISOString() });
    const body = await (await getSubscription()).json();
    expect(body).toMatchObject({
      isPro: false,
      entitlement: null,
      limitsEnforced: false,
      webCheckoutAvailable: true,
      webPortalAvailable: false,
      usage: { syllabusImports: { used: 1, limit: 3, remaining: 2, allowed: true } },
    });
    expect(body.usage.syllabusImports.term).toMatch(/^(Winter|Summer|Fall) \d{4}$/);
  });

  it("reports Pro and the portal for a Stripe subscriber", async () => {
    store.tables.user_entitlements.push({
      user_id: USER,
      source: "stripe",
      status: "active",
      plan: "yearly",
      product_id: "price_year",
      current_period_end: "2099-01-01T00:00:00.000Z",
      stripe_customer_id: "cus_1",
    });
    const body = await (await getSubscription()).json();
    expect(body).toMatchObject({
      isPro: true,
      entitlement: { source: "stripe", status: "active", plan: "yearly", productId: "price_year" },
      webPortalAvailable: true,
      usage: { syllabusImports: { limit: null, remaining: null, allowed: true } },
    });
  });

  it("hides checkout when Stripe keys are missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const body = await (await getSubscription()).json();
    expect(body.webCheckoutAvailable).toBe(false);
  });
});

// ---- Free-tier limit on syllabus import ----

const draft = {
  course: { name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026", target_grade: 85 },
  categories: [],
  items: [],
  warnings: [],
};

function useImports(count: number) {
  for (let i = 0; i < count; i += 1) store.tables.syllabus_imports.push({ user_id: USER, created_at: new Date().toISOString() });
}

async function postParse() {
  const form = new FormData();
  form.append("text", "CHEM 201 syllabus");
  const { POST } = await import("./mobile/courses/import/parse/route");
  return POST(new NextRequest("http://localhost/api/mobile/courses/import/parse", { method: "POST", body: form }));
}

async function postApply() {
  store.tables.courses ??= [];
  const { POST } = await import("./mobile/courses/import/apply/route");
  return POST(
    new NextRequest("http://localhost/api/mobile/courses/import/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    }),
  );
}

/** The apply route inserts the course with .insert().select().single(); the memory db only needs single(). */
function withSingle(db: ReturnType<typeof memoryDb>["db"]) {
  return {
    from(table: string) {
      const builder = db.from(table) as Record<string, unknown>;
      if (table === "courses") {
        builder.single = () => ({ then: (resolve: (value: unknown) => unknown) => resolve({ data: { id: "course-1" }, error: null }) });
      }
      return builder;
    },
  };
}

describe("syllabus import limit", () => {
  beforeEach(() => {
    mocks.getAuth.mockResolvedValue({ user: { id: USER }, supabase: withSingle(store.db) });
    mocks.parseSyllabus.mockResolvedValue(draft);
  });

  it("doesn't limit anyone while PRO_ENFORCE_LIMITS is off", async () => {
    useImports(5);
    expect((await postParse()).status).toBe(200);
  });

  it("returns 402 syllabus_import_limit from parse and apply once a free student has used 3 this term", async () => {
    vi.stubEnv("PRO_ENFORCE_LIMITS", "true");
    useImports(3);
    const parse = await postParse();
    expect(parse.status).toBe(402);
    const body = await parse.json();
    expect(body).toMatchObject({ code: "syllabus_import_limit", usage: { used: 3, limit: 3, remaining: 0, allowed: false } });
    expect(body.error).toMatch(/Upgrade to Atlas Pro/);
    expect(mocks.parseSyllabus).not.toHaveBeenCalled();

    const apply = await postApply();
    expect(apply.status).toBe(402);
    expect((await apply.json()).code).toBe("syllabus_import_limit");
  });

  it("lets a free student with imports left through and records the import", async () => {
    vi.stubEnv("PRO_ENFORCE_LIMITS", "true");
    useImports(2);
    expect((await postParse()).status).toBe(200);
    const apply = await postApply();
    expect(apply.status).toBe(200);
    expect(store.tables.syllabus_imports).toHaveLength(3);
    expect(store.tables.syllabus_imports[2]).toMatchObject({ user_id: USER, course_id: "course-1" });
  });

  it("doesn't count imports from an earlier term", async () => {
    vi.stubEnv("PRO_ENFORCE_LIMITS", "true");
    for (let i = 0; i < 3; i += 1) {
      store.tables.syllabus_imports.push({ user_id: USER, created_at: new Date(Date.now() - 124 * 86_400_000).toISOString() });
    }
    expect((await postParse()).status).toBe(200);
  });

  it("never limits Pro", async () => {
    vi.stubEnv("PRO_ENFORCE_LIMITS", "true");
    useImports(10);
    store.tables.user_entitlements.push({
      user_id: USER,
      source: "revenuecat",
      status: "active",
      plan: "monthly",
      current_period_end: "2099-01-01T00:00:00.000Z",
    });
    expect((await postParse()).status).toBe(200);
    expect((await postApply()).status).toBe(200);
  });
});
