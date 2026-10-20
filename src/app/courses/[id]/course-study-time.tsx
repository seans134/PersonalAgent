"use client";

import { useEffect, useState } from "react";
import { formatStudyMinutes, type StudySummary } from "@personal-agent/core";
import { StartStudyButton } from "@/components/study-timer/study-timer-bar";
import { useStudyTimer } from "@/components/study-timer/study-timer-provider";

/** "4 h 20 min studied this term" and a Start studying button; the total reloads when a session is saved. */
export function CourseStudyTime({
  courseId,
  initialMinutes,
  archived,
}: {
  courseId: string;
  initialMinutes: number | null;
  archived: boolean;
}) {
  const { onSessionsChanged } = useStudyTimer();
  const [minutes, setMinutes] = useState(initialMinutes);

  useEffect(
    () =>
      onSessionsChanged(() => {
        void fetch(`/api/mobile/study-sessions/summary?courseId=${encodeURIComponent(courseId)}`)
          .then((response) => (response.ok ? (response.json() as Promise<StudySummary>) : null))
          .then((summary) => {
            if (summary?.courseTotalMinutes !== undefined) setMinutes(summary.courseTotalMinutes);
          })
          .catch(() => undefined);
      }),
    [courseId, onSessionsChanged],
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {minutes !== null ? (
        <p className="font-mono text-[12px] text-ink-muted">
          {minutes > 0 ? `${formatStudyMinutes(minutes)} studied this term` : "No study time logged yet"}
        </p>
      ) : null}
      {archived ? null : <StartStudyButton target={{ courseId }} />}
    </div>
  );
}
