import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SYLLABUS_IMPORT_LIMIT_CODE,
  SYLLABUS_IMPORT_LOOKBACK_DAYS,
  academicTermFor,
  countImportsInTerm,
  isEntitlementActive,
  syllabusImportAllowance,
  syllabusImportLimitMessage,
  type SubscriptionStatusResponse,
  type SyllabusImportLimitError,
  type SyllabusImportUsage,
} from "@personal-agent/core";
import { localDateOnly } from "@/lib/courses/local-time";
import { proLimitsEnforced, stripeCheckoutConfigured } from "./config";
import { loadEntitlement, toProEntitlement } from "./entitlements";

const DEFAULT_TIMEZONE = "America/Toronto";

async function profileTimezone(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from("user_profiles").select("timezone").eq("user_id", userId).maybeSingle();
  const timezone = typeof data?.timezone === "string" ? data.timezone.trim() : "";
  if (!timezone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Syllabus imports in the student's current term (by their profile timezone). Fails open to 0. */
async function countSyllabusImportsThisTerm(supabase: SupabaseClient, userId: string, now: Date) {
  const timezone = await profileTimezone(supabase, userId);
  const term = academicTermFor(localDateOnly(now.toISOString(), timezone));
  const since = new Date(now.getTime() - SYLLABUS_IMPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("syllabus_imports")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    // Before the migration is applied there is nothing to count; never block an import over it.
    console.warn("[subscription] unable to count syllabus imports", error.message);
    return { term, used: 0 };
  }
  const localDates = ((data ?? []) as Array<{ created_at: string }>).map((row) => localDateOnly(row.created_at, timezone));
  return { term, used: countImportsInTerm(localDates, term) };
}

/** Everything GET /api/mobile/subscription returns, read with the student's own client (RLS). */
export async function loadSubscriptionStatus(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<SubscriptionStatusResponse> {
  const [row, count] = await Promise.all([
    loadEntitlement(supabase, userId),
    countSyllabusImportsThisTerm(supabase, userId, now),
  ]);
  const entitlement = toProEntitlement(row);
  const isPro = isEntitlementActive(entitlement, now);
  const limitsEnforced = proLimitsEnforced();
  const checkout = stripeCheckoutConfigured();
  return {
    isPro,
    entitlement: entitlement ? { ...entitlement, productId: row?.product_id ?? null } : null,
    usage: {
      syllabusImports: syllabusImportAllowance({ isPro, usedThisTerm: count.used, term: count.term, enforceLimits: limitsEnforced }),
    },
    limitsEnforced,
    webCheckoutAvailable: checkout,
    webPortalAvailable: checkout && Boolean(row?.stripe_customer_id),
  };
}

/** The student's syllabus import allowance right now. */
export async function syllabusImportUsage(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<SyllabusImportUsage> {
  return (await loadSubscriptionStatus(supabase, userId, now)).usage.syllabusImports;
}

/** The 402 body the import routes return when the free limit is used up (both surfaces show an upgrade prompt). */
export function syllabusImportLimitBody(usage: SyllabusImportUsage): SyllabusImportLimitError {
  return { error: syllabusImportLimitMessage(usage), code: SYLLABUS_IMPORT_LIMIT_CODE, usage };
}

/** Logs a successful import. Best effort: a failure here never undoes the course that was created. */
export async function recordSyllabusImport(supabase: SupabaseClient, userId: string, courseId: string) {
  const { error } = await supabase.from("syllabus_imports").insert({ user_id: userId, course_id: courseId });
  if (error) console.warn("[subscription] unable to record syllabus import", error.message);
}
