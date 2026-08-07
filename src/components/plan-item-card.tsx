import type { PlannedItem } from "@/lib/planner";

const TYPE_CLASS: Record<PlannedItem["type"], string> = {
  goal: "bg-goal/12 text-goal",
  focus: "bg-focus/12 text-focus",
  fitness: "bg-fitness/12 text-fitness",
  wellness: "bg-wellness/12 text-wellness",
  fallback: "bg-ink-muted/12 text-ink-muted",
};

type PlanItemCardProps = {
  item: PlannedItem;
};

export function PlanItemCard({ item }: PlanItemCardProps) {
  return (
    <li className="rounded-lg border border-line bg-surface2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            {item.startTime} - {item.endTime}
          </p>
          <p className="mt-1 text-base font-semibold text-ink">{item.title}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${TYPE_CLASS[item.type]}`}>
          {item.type}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{item.reason}</p>
    </li>
  );
}
