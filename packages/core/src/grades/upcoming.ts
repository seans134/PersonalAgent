export type UpcomingCheckItem = { dueAt: string; scoreEarned: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

// Ungraded items due from `now` up to `days` days ahead. Items already scored count as done.
export function countDueWithin(items: UpcomingCheckItem[], now: Date, days = 7): number {
  const start = now.getTime();
  const end = start + days * DAY_MS;
  return items.filter((item) => {
    if (item.scoreEarned !== null) return false;
    const due = Date.parse(item.dueAt);
    return Number.isFinite(due) && due >= start && due <= end;
  }).length;
}
