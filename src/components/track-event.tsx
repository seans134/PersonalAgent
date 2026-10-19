"use client";

import { useEffect, useRef } from "react";
import type { AnalyticsEventName } from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

type TrackedEvent = { event: AnalyticsEventName; properties?: Record<string, string | number | boolean | null> };

/**
 * Captures events a server action flagged in the URL (e.g. `?completed=1`), once, then swaps the URL
 * for `replaceUrl` so a reload doesn't capture them again.
 */
export function TrackEvents({ events, replaceUrl }: { events: TrackedEvent[]; replaceUrl: string }) {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    for (const { event, properties } of events) captureEvent(event, properties);
    window.history.replaceState(window.history.state, "", replaceUrl);
  }, [events, replaceUrl]);

  return null;
}
