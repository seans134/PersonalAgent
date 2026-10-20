import { describe, expect, it } from "vitest";
import { analyticsEvents } from "../analytics";
import {
  FREE_SYLLABUS_IMPORTS_PER_TERM,
  academicTermFor,
  countImportsInTerm,
  describeEntitlement,
  inferProPlan,
  isEntitlementActive,
  isSyllabusImportLimitError,
  paywallTrigger,
  syllabusImportAllowance,
  syllabusImportLimitMessage,
  type ProEntitlement,
} from "./index";

const now = new Date("2026-10-20T12:00:00Z");

function entitlement(patch: Partial<ProEntitlement> = {}): ProEntitlement {
  return { source: "stripe", status: "active", plan: "monthly", currentPeriodEnd: "2026-11-20T12:00:00Z", ...patch };
}

describe("academicTermFor", () => {
  it("splits the year into Winter, Summer and Fall", () => {
    expect(academicTermFor("2026-01-01")).toEqual({ label: "Winter 2026", start: "2026-01-01", end: "2026-05-01" });
    expect(academicTermFor("2026-04-30")).toEqual({ label: "Winter 2026", start: "2026-01-01", end: "2026-05-01" });
    expect(academicTermFor("2026-05-01")).toEqual({ label: "Summer 2026", start: "2026-05-01", end: "2026-09-01" });
    expect(academicTermFor("2026-08-31").label).toBe("Summer 2026");
    expect(academicTermFor("2026-09-01")).toEqual({ label: "Fall 2026", start: "2026-09-01", end: "2027-01-01" });
    expect(academicTermFor("2026-12-31").label).toBe("Fall 2026");
  });

  it("rejects malformed dates", () => {
    expect(() => academicTermFor("Fall")).toThrow();
  });
});

describe("countImportsInTerm", () => {
  it("counts only local dates inside the term", () => {
    const term = academicTermFor("2026-10-20");
    expect(countImportsInTerm(["2026-08-31", "2026-09-01", "2026-10-20", "2026-12-31", "2027-01-01"], term)).toBe(3);
    expect(countImportsInTerm([], term)).toBe(0);
  });
});

describe("syllabusImportAllowance", () => {
  const term = academicTermFor("2026-10-20");

  it("gives free accounts three per term when enforced", () => {
    expect(FREE_SYLLABUS_IMPORTS_PER_TERM).toBe(3);
    expect(syllabusImportAllowance({ isPro: false, usedThisTerm: 2, term, enforceLimits: true })).toEqual({
      term: "Fall 2026",
      used: 2,
      limit: 3,
      remaining: 1,
      allowed: true,
    });
    expect(syllabusImportAllowance({ isPro: false, usedThisTerm: 3, term, enforceLimits: true })).toMatchObject({
      remaining: 0,
      allowed: false,
    });
    expect(syllabusImportAllowance({ isPro: false, usedThisTerm: 7, term, enforceLimits: true }).remaining).toBe(0);
  });

  it("allows everything while enforcement is off, still reporting usage", () => {
    expect(syllabusImportAllowance({ isPro: false, usedThisTerm: 9, term, enforceLimits: false })).toMatchObject({
      used: 9,
      limit: 3,
      remaining: 0,
      allowed: true,
    });
  });

  it("is unlimited for Pro", () => {
    expect(syllabusImportAllowance({ isPro: true, usedThisTerm: 40, term, enforceLimits: true })).toEqual({
      term: "Fall 2026",
      used: 40,
      limit: null,
      remaining: null,
      allowed: true,
    });
  });
});

describe("isEntitlementActive", () => {
  it("is Pro while the period lasts, including canceled and past-due grace", () => {
    expect(isEntitlementActive(entitlement(), now)).toBe(true);
    expect(isEntitlementActive(entitlement({ status: "trialing" }), now)).toBe(true);
    expect(isEntitlementActive(entitlement({ status: "canceled" }), now)).toBe(true);
    expect(isEntitlementActive(entitlement({ status: "past_due" }), now)).toBe(true);
  });

  it("is not Pro once expired or past the period end", () => {
    expect(isEntitlementActive(null, now)).toBe(false);
    expect(isEntitlementActive(entitlement({ status: "expired" }), now)).toBe(false);
    expect(isEntitlementActive(entitlement({ currentPeriodEnd: "2026-10-19T12:00:00Z" }), now)).toBe(false);
  });

  it("without a period end only counts plainly active subscriptions", () => {
    expect(isEntitlementActive(entitlement({ currentPeriodEnd: null }), now)).toBe(true);
    expect(isEntitlementActive(entitlement({ currentPeriodEnd: null, status: "canceled" }), now)).toBe(false);
  });
});

describe("inferProPlan", () => {
  it("reads the plan from store product ids", () => {
    expect(inferProPlan("atlas_pro_monthly")).toBe("monthly");
    expect(inferProPlan("atlas_pro_yearly")).toBe("yearly");
    expect(inferProPlan("atlas.pro.annual")).toBe("yearly");
    expect(inferProPlan("atlas_pro:p1m")).toBe("monthly");
    expect(inferProPlan("something")).toBeNull();
    expect(inferProPlan(null)).toBeNull();
  });
});

describe("limit error helpers", () => {
  it("recognizes the limit error body", () => {
    expect(isSyllabusImportLimitError({ code: "syllabus_import_limit", error: "x" })).toBe(true);
    expect(isSyllabusImportLimitError({ error: "x" })).toBe(false);
    expect(isSyllabusImportLimitError(null)).toBe(false);
    expect(syllabusImportLimitMessage({ limit: 3, term: "Fall 2026" })).toMatch(/3 free syllabus imports for Fall 2026/);
  });

  it("maps paywall triggers to a closed set", () => {
    expect(paywallTrigger("import_limit")).toBe("import_limit");
    expect(paywallTrigger("profile")).toBe("profile");
    expect(paywallTrigger("anything else")).toBe("menu");
    expect(paywallTrigger(undefined)).toBe("menu");
  });
});

describe("describeEntitlement", () => {
  it("reads renewal, end and payment-issue dates", () => {
    expect(describeEntitlement(entitlement(), now)).toBe("Monthly · renews Nov 20, 2026");
    expect(describeEntitlement(entitlement({ plan: "yearly", status: "canceled" }), now)).toBe("Yearly · ends Nov 20, 2026");
    expect(describeEntitlement(entitlement({ status: "past_due" }), now)).toMatch(/payment issue/);
    expect(describeEntitlement(entitlement({ status: "expired" }), now)).toBeNull();
  });
});

describe("analytics events", () => {
  it("registers the paywall and subscription events", () => {
    expect(analyticsEvents.paywallViewed).toBe("paywall_viewed");
    expect(analyticsEvents.subscriptionStarted).toBe("subscription_started");
  });
});
