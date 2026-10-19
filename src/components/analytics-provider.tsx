"use client";

import { useEffect } from "react";
import { syncAnalyticsUser } from "@/lib/analytics";

// Starts PostHog when NEXT_PUBLIC_POSTHOG_KEY is set and keeps the identified user in step with the session.
export function AnalyticsProvider({ userId }: { userId: string | null }) {
  useEffect(() => {
    syncAnalyticsUser(userId);
  }, [userId]);

  return null;
}
