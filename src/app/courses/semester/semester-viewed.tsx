"use client";

import { useEffect } from "react";
import { analyticsEvents } from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

/** Captures semester_viewed once per shown timeline (counts only). */
export function SemesterViewed({ term, weekCount, crunchWeekCount }: { term: string; weekCount: number; crunchWeekCount: number }) {
  useEffect(() => {
    captureEvent(analyticsEvents.semesterViewed, { week_count: weekCount, crunch_week_count: crunchWeekCount });
    // term only keys the effect so switching terms counts as a new view; it is never sent.
  }, [term, weekCount, crunchWeekCount]);
  return null;
}
