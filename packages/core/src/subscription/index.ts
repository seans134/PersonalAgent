// Atlas Pro: plans, the entitlement a student holds, and the free-tier syllabus import limit.
// Shared by the web app, the API (/api/mobile/subscription, the syllabus import routes, the Stripe
// and RevenueCat webhooks) and the mobile app, so both surfaces agree on who is Pro and what's left.
//
// Pro unlocks unlimited syllabus imports and shows a "Supporting Atlas" badge. Everything in the
// core loop (Today plan, calendar, courses, study timer, GPA, LMS feed) stays free.

export type ProPlan = "monthly" | "yearly";

export const PRO_PLANS: readonly ProPlan[] = ["monthly", "yearly"];

/**
 * Default list prices, shown when the store can't give a localized price (web, or before the
 * RevenueCat offering loads). The real charge is whatever the Stripe price / store product says.
 */
export const PRO_PRICE_LABELS: Record<ProPlan, { price: string; period: string }> = {
  monthly: { price: "$3.99", period: "month" },
  yearly: { price: "$24.99", period: "year" },
};

/** Syllabus imports a free account gets each term (see academicTermFor). */
export const FREE_SYLLABUS_IMPORTS_PER_TERM = 3;

export type EntitlementSource = "stripe" | "revenuecat";

/**
 * active / trialing: paid up. past_due: a renewal failed and the store is retrying (still Pro until
 * the period ends). canceled: won't renew, Pro until the period ends. expired: no longer Pro.
 */
export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled" | "expired";

export const ENTITLEMENT_STATUSES: readonly EntitlementStatus[] = ["active", "trialing", "past_due", "canceled", "expired"];

export type ProEntitlement = {
  source: EntitlementSource;
  status: EntitlementStatus;
  plan: ProPlan | null;
  /** ISO timestamp the current paid period ends (renewal or expiry); null when unknown. */
  currentPeriodEnd: string | null;
};

/** Whether an entitlement makes the student Pro right now. */
export function isEntitlementActive(entitlement: ProEntitlement | null, now: Date = new Date()): boolean {
  if (!entitlement || entitlement.status === "expired") return false;
  if (!entitlement.currentPeriodEnd) {
    // Without a period end only a plainly active subscription counts.
    return entitlement.status === "active" || entitlement.status === "trialing";
  }
  const end = Date.parse(entitlement.currentPeriodEnd);
  return Number.isFinite(end) && end > now.getTime();
}

/**
 * The plan for a store product id when no explicit mapping exists (RevenueCat / App Store / Play
 * product ids such as "atlas_pro_monthly" or "atlas_pro_annual"). Null when it can't tell.
 */
export function inferProPlan(productId: string | null | undefined): ProPlan | null {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (/(year|annual|12m|p1y)/.test(id)) return "yearly";
  if (/(month|1m\b|p1m)/.test(id)) return "monthly";
  return null;
}

// ---- Terms ----
//
// A "term" for the free-tier limit is a fixed slice of the calendar year in the student's own
// timezone: Winter (Jan-Apr), Summer (May-Aug), Fall (Sep-Dec). Course terms in Atlas are optional
// free text ("Fall 2026", "2026W", or blank) that the student can edit in the import review, so they
// can't be trusted to meter imports; the calendar term uses the same names most schools do and
// resets on the same dates for everyone.

export type AcademicTerm = {
  /** "Fall 2026". */
  label: string;
  /** First day of the term (YYYY-MM-DD, inclusive). */
  start: string;
  /** First day after the term (YYYY-MM-DD, exclusive). */
  end: string;
};

const TERM_STARTS: Array<{ month: number; name: string }> = [
  { month: 1, name: "Winter" },
  { month: 5, name: "Summer" },
  { month: 9, name: "Fall" },
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/** The term a local date (YYYY-MM-DD) falls in. */
export function academicTermFor(localDate: string): AcademicTerm {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(localDate);
  if (!match) throw new Error(`Invalid date: ${localDate}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const index = month >= 9 ? 2 : month >= 5 ? 1 : 0;
  const term = TERM_STARTS[index];
  const next = TERM_STARTS[(index + 1) % TERM_STARTS.length];
  const endYear = index === TERM_STARTS.length - 1 ? year + 1 : year;
  return {
    label: `${term.name} ${year}`,
    start: `${year}-${pad2(term.month)}-01`,
    end: `${endYear}-${pad2(next.month)}-01`,
  };
}

/** How many imports (by their local date, YYYY-MM-DD) fall in the term. */
export function countImportsInTerm(importLocalDates: string[], term: AcademicTerm): number {
  return importLocalDates.filter((date) => date.slice(0, 10) >= term.start && date.slice(0, 10) < term.end).length;
}

/** Days of import history to load so every import in the current term is covered (terms are at most 123 days). */
export const SYLLABUS_IMPORT_LOOKBACK_DAYS = 125;

// ---- Syllabus import allowance ----

export type SyllabusImportUsage = {
  /** Term label the count is for ("Fall 2026"). */
  term: string;
  used: number;
  /** Null when unlimited (Pro). */
  limit: number | null;
  /** Null when unlimited (Pro). */
  remaining: number | null;
  /** False only when limits are enforced and none are left. */
  allowed: boolean;
};

/**
 * What a student may import this term. With enforcement off (the default until payments are live)
 * everyone is allowed, but the count and limit are still reported so clients can preview it.
 */
export function syllabusImportAllowance(input: {
  isPro: boolean;
  usedThisTerm: number;
  term: AcademicTerm;
  enforceLimits: boolean;
  limit?: number;
}): SyllabusImportUsage {
  const used = Math.max(0, Math.floor(input.usedThisTerm));
  if (input.isPro) {
    return { term: input.term.label, used, limit: null, remaining: null, allowed: true };
  }
  const limit = input.limit ?? FREE_SYLLABUS_IMPORTS_PER_TERM;
  const remaining = Math.max(0, limit - used);
  return { term: input.term.label, used, limit, remaining, allowed: !input.enforceLimits || remaining > 0 };
}

/** Error code the import routes return (HTTP 402) when the free limit is used up. */
export const SYLLABUS_IMPORT_LIMIT_CODE = "syllabus_import_limit";
export const SYLLABUS_IMPORT_LIMIT_STATUS = 402;

export type SyllabusImportLimitError = {
  error: string;
  code: typeof SYLLABUS_IMPORT_LIMIT_CODE;
  usage: SyllabusImportUsage;
};

export function syllabusImportLimitMessage(usage: Pick<SyllabusImportUsage, "limit" | "term">): string {
  return `You've used all ${usage.limit ?? FREE_SYLLABUS_IMPORTS_PER_TERM} free syllabus imports for ${usage.term}. Upgrade to Atlas Pro for unlimited imports, or add the course by hand.`;
}

export function isSyllabusImportLimitError(value: unknown): value is SyllabusImportLimitError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === SYLLABUS_IMPORT_LIMIT_CODE
  );
}

// ---- GET /api/mobile/subscription ----

export type SubscriptionStatusResponse = {
  isPro: boolean;
  /** The stored entitlement, or null when the student has never subscribed. */
  entitlement: (ProEntitlement & { productId: string | null }) | null;
  usage: { syllabusImports: SyllabusImportUsage };
  /** Whether the free-tier limit is enforced (PRO_ENFORCE_LIMITS). */
  limitsEnforced: boolean;
  /** Whether web checkout (Stripe) is set up on the server. Mobile checks its own RevenueCat keys. */
  webCheckoutAvailable: boolean;
  /** Whether the student can open the Stripe customer portal (has a Stripe customer). */
  webPortalAvailable: boolean;
};

// ---- Analytics ----

/** Where a paywall was opened from. */
export type PaywallTrigger = "import_limit" | "profile" | "menu";

export function isProPlan(value: unknown): value is ProPlan {
  return value === "monthly" || value === "yearly";
}

export function paywallTrigger(value: unknown): PaywallTrigger {
  return value === "import_limit" || value === "profile" ? value : "menu";
}

/** How a Pro status reads to the student ("Renews Nov 20, 2026" / "Ends Nov 20, 2026"). */
export function describeEntitlement(entitlement: ProEntitlement | null, now: Date = new Date()): string | null {
  if (!entitlement || !isEntitlementActive(entitlement, now)) return null;
  const plan = entitlement.plan === "yearly" ? "Yearly" : entitlement.plan === "monthly" ? "Monthly" : "Pro";
  if (!entitlement.currentPeriodEnd) return plan;
  const date = new Date(entitlement.currentPeriodEnd).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  if (entitlement.status === "canceled") return `${plan} · ends ${date}`;
  if (entitlement.status === "past_due") return `${plan} · payment issue, update by ${date}`;
  return `${plan} · renews ${date}`;
}
