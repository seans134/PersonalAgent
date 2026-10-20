"use client";

import { useEffect } from "react";
import { analyticsEvents } from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

/** Captures gpa_viewed once per page view (counts only). */
export function GpaViewed({ termCount, courseCount }: { termCount: number; courseCount: number }) {
  useEffect(() => {
    captureEvent(analyticsEvents.gpaViewed, { term_count: termCount, course_count: courseCount });
  }, [termCount, courseCount]);
  return null;
}
