import type { PlannedItem } from "@/lib/planner";

const TYPE_CLASS: Record<PlannedItem["type"], string> = {
  goal: "bg-sky-100 text-sky-800",
  focus: "bg-indigo-100 text-indigo-800",
  fitness: "bg-emerald-100 text-emerald-800",
  wellness: "bg-teal-100 text-teal-800",
  fallback: "bg-amber-100 text-amber-800",
};

type PlanItemCardProps = {
  item: PlannedItem;
};

export function PlanItemCard({ item }: PlanItemCardProps) {
  return (
    <li className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            {item.startTime} - {item.endTime}
          </p>
          <p className="mt-1 text-base font-semibold text-zinc-900">{item.title}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${TYPE_CLASS[item.type]}`}>
          {item.type}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-700">{item.reason}</p>
    </li>
  );
}
