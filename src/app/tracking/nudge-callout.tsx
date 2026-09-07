"use client";

import type { Nudge } from "@personal-agent/core";

/** Small dismissible-feeling callout shown right after logging a meal or workout. */
export function NudgeCallout({ nudges }: { nudges?: Nudge[] }) {
  if (!nudges || nudges.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {nudges.map((nudge) => (
        <p
          key={nudge.id}
          className="rounded-lg border border-line bg-surface2 px-3 py-2 text-sm text-ink"
        >
          <span className={nudge.tone === "positive" ? "mr-2 text-success" : "mr-2 text-warning"}>
            {nudge.tone === "positive" ? "✓" : "→"}
          </span>
          {nudge.message}
        </p>
      ))}
    </div>
  );
}
