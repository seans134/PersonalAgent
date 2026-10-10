import type { NeededScore } from "./types";

/**
 * Percent for display, one decimal, matching the web/mobile `formatGrade` helpers.
 * Clamped at 0 so float noise or odd data never shows a negative percent.
 */
export function formatGradePercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.max(0, value).toFixed(1);
  return `${rounded === "-0.0" ? "0.0" : rounded}%`;
}

export type NeededCopy = { short: string; long: string };

/** Shared "what do I need on the rest" copy for web and mobile. Null when there is nothing to say. */
export function describeNeeded(needed: NeededScore): NeededCopy | null {
  switch (needed.status) {
    case "needed": {
      const percent = formatGradePercent(needed.neededPercent);
      return {
        short: `Need ${percent} on the rest`,
        long: `You need an average of ${percent} on the remaining work (${formatGradePercent(needed.remainingWeight)} of your grade still to come).`,
      };
    }
    case "secured":
      return { short: "Target secured", long: "Target secured, even with 0% on what's left." };
    case "out_of_reach":
      return {
        short: "Out of reach",
        long: `Out of reach: the best you can finish with is ${formatGradePercent(needed.maxPossible)}.`,
      };
    case "nothing_left": {
      const outcome = needed.met ? "met" : "missed";
      return {
        short: `Target ${outcome}`,
        long: `Final grade ${formatGradePercent(needed.finalGrade)}: target ${outcome}.`,
      };
    }
    case "no_target":
    case "no_categories":
      return null;
  }
}

/** Parses a what-if percent typed by the user; null unless it is a number from 0 to 100. */
export function parsePercentInput(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
