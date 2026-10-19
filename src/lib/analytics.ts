"use client";

import posthog from "posthog-js";
import { redactShareLinksInEvent, type AnalyticsEventName } from "@personal-agent/core";

type AnalyticsProperties = Record<string, string | number | boolean | null>;

// With no key, every function here is a no-op: posthog-js is never initialized and makes no requests.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let ready = false;
let identifiedUserId: string | null = null;
// Events fired before AnalyticsProvider identifies the user (child effects run first) wait here.
const pending: Array<[AnalyticsEventName, AnalyticsProperties | undefined]> = [];

/** Called by AnalyticsProvider with the signed-in Supabase user id (never email), or null when signed out. */
export function syncAnalyticsUser(userId: string | null) {
  if (!posthogKey || typeof window === "undefined") return;

  if (!ready) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: true,
      // Pageviews of /join/<token> must not send the working link to analytics.
      before_send: (event) => (event ? redactShareLinksInEvent(event) : event),
    });
    ready = true;
  }

  if (userId && userId !== identifiedUserId) {
    posthog.identify(userId);
    identifiedUserId = userId;
  } else if (!userId && (identifiedUserId || posthog.get_property("$user_state") === "identified")) {
    // Sign-out is a full page load, so module state is fresh; PostHog's persisted state still holds the old user.
    posthog.reset();
    identifiedUserId = null;
  }

  for (const [event, properties] of pending.splice(0)) posthog.capture(event, properties);
}

export function captureEvent(event: AnalyticsEventName, properties?: AnalyticsProperties) {
  if (!posthogKey || typeof window === "undefined") return;
  if (ready) posthog.capture(event, properties);
  else pending.push([event, properties]);
}

const capturedThisSession = new Set<string>();

/** Captures an event at most once per browser session for the given key (e.g. per course). */
export function captureEventOnce(key: string, event: AnalyticsEventName, properties?: AnalyticsProperties) {
  if (!posthogKey || typeof window === "undefined") return;
  const storageKey = `atlas.analytics.${event}.${key}`;
  if (capturedThisSession.has(storageKey)) return;
  capturedThisSession.add(storageKey);
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Storage can be blocked; the in-memory set still limits it to once per page load.
  }
  captureEvent(event, properties);
}
