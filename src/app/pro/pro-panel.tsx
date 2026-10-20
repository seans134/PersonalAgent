"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FREE_SYLLABUS_IMPORTS_PER_TERM,
  PRO_PLANS,
  PRO_PRICE_LABELS,
  analyticsEvents,
  describeEntitlement,
  type PaywallTrigger,
  type ProPlan,
  type SubscriptionStatusResponse,
} from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

const FREE_FEATURES = ["Today plan", "Calendar", "Courses & grades", "Study timer", "GPA", "LMS deadline feed"];

export function ProPanel({
  status,
  trigger,
  checkout,
  purchasedPlan,
}: {
  status: SubscriptionStatusResponse;
  trigger: PaywallTrigger;
  checkout: "success" | "canceled" | null;
  purchasedPlan: ProPlan | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<ProPlan | "portal" | null>(null);
  const [error, setError] = useState("");
  const trackedRef = useRef(false);
  const usage = status.usage.syllabusImports;
  const description = status.entitlement ? describeEntitlement(status.entitlement) : null;

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    if (checkout === "success" && purchasedPlan) {
      captureEvent(analyticsEvents.subscriptionStarted, { plan: purchasedPlan });
    } else if (!status.isPro) {
      captureEvent(analyticsEvents.paywallViewed, { trigger, surface: "web", available: status.webCheckoutAvailable });
    }
    // Drop ?checkout= so a reload doesn't count the purchase twice.
    if (checkout) window.history.replaceState(window.history.state, "", "/pro");
  }, [checkout, purchasedPlan, status.isPro, status.webCheckoutAvailable, trigger]);

  // The webhook usually lands within seconds of returning from Checkout; refresh until it does.
  useEffect(() => {
    if (checkout !== "success" || status.isPro) return;
    const timer = window.setTimeout(() => router.refresh(), 3000);
    return () => window.clearTimeout(timer);
  }, [checkout, status.isPro, router]);

  async function openBilling(url: string, body: unknown, key: ProPlan | "portal") {
    setBusy(key);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error ?? "Unable to open billing. Please try again.");
      window.location.assign(payload.url);
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : "Unable to open billing. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {checkout === "success" ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-teal" role="status">
          {status.isPro ? "Thanks for supporting Atlas! Pro is active." : "Thanks for supporting Atlas! Finishing up your upgrade…"}
        </p>
      ) : null}
      {checkout === "canceled" ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted" role="status">
          Checkout was canceled. Nothing was charged.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {status.isPro ? (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-teal">
            Pro · Supporting Atlas
          </span>
          {description ? <p className="text-sm text-ink">{description}</p> : null}
          <p className="text-sm text-ink-muted">Unlimited syllabus imports are on. Thank you for helping keep Atlas running.</p>
          {status.entitlement?.source === "stripe" && status.webPortalAvailable ? (
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface2 disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => openBilling("/api/billing/portal", {}, "portal")}
              type="button"
            >
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          ) : status.entitlement?.source === "revenuecat" ? (
            <p className="text-sm text-ink-muted">You subscribed in the Atlas app. Manage or cancel it in your App Store or Google Play settings.</p>
          ) : null}
        </section>
      ) : (
        <section className="space-y-5 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-ink">Unlimited syllabus imports</h2>
            <p className="text-sm text-ink-muted">
              Free accounts can import {FREE_SYLLABUS_IMPORTS_PER_TERM} syllabi a term. Pro removes the limit and shows a
              Supporting Atlas badge on your profile.
            </p>
            {status.limitsEnforced && usage.limit !== null ? (
              <p className="text-sm text-ink">
                {usage.used} of {usage.limit} free imports used for {usage.term}.
              </p>
            ) : null}
          </div>

          {status.webCheckoutAvailable ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {PRO_PLANS.map((plan) => (
                <button
                  className="rounded-xl border border-line bg-surface2 p-4 text-left transition hover:border-teal disabled:opacity-60"
                  disabled={busy !== null}
                  key={plan}
                  onClick={() => openBilling("/api/billing/checkout", { plan }, plan)}
                  type="button"
                >
                  <span className="block font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                    {plan === "yearly" ? "Yearly" : "Monthly"}
                  </span>
                  <span className="mt-1 block text-xl font-semibold text-ink">
                    {PRO_PRICE_LABELS[plan].price}
                    <span className="text-sm font-normal text-ink-muted"> / {PRO_PRICE_LABELS[plan].period}</span>
                  </span>
                  <span className="mt-2 block text-sm text-teal">{busy === plan ? "Opening checkout…" : "Upgrade"}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink-muted">Pro is coming soon.</p>
          )}
        </section>
      )}

      <section className="space-y-2 rounded-2xl border border-line p-6">
        <h2 className="text-sm font-semibold text-ink">Always free</h2>
        <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
          {FREE_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <p className="pt-2 text-sm text-ink-muted">
          You can always add courses by hand on <Link className="text-teal underline" href="/courses">Courses</Link>.
        </p>
      </section>
    </div>
  );
}
