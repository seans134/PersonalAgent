import type { CSSProperties } from "react";
import type { PlannedItem, PlanItemStatus } from "@/lib/planner";
import type { TodayPlanContextEvent } from "@/lib/planner/client-types";

type EntryCategory = PlannedItem["type"] | "commit";

type Entry = {
  key: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  title: string;
  subtitle: string;
  category: EntryCategory;
  fixed: boolean;
  item?: PlannedItem;
};

export type PlanItemCheckoffHandler = (item: PlannedItem, tapped: PlanItemStatus) => void;

function toMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function durationLabel(start: string, end: string) {
  const mins = Math.max(0, toMinutes(end) - toMinutes(start));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function accentVar(category: EntryCategory): string {
  switch (category) {
    case "goal":
      return "var(--color-goal)";
    case "focus":
      return "var(--color-focus)";
    case "fitness":
      return "var(--color-fitness)";
    case "wellness":
      return "var(--color-wellness)";
    case "study":
      return "var(--color-focus)";
    case "commit":
      return "var(--color-commit)";
    case "fallback":
    default:
      return "var(--color-ink-muted)";
  }
}

function CheckoffButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-[8px] border px-2.5 py-1 font-mono text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active ? "border-teal bg-teal text-on-teal" : "border-line bg-surface text-ink-muted hover:border-teal hover:text-teal"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function MeridianRow({
  entry,
  isFirst,
  isLast,
  index,
  onCheckoff,
  pending,
}: {
  entry: Entry;
  isFirst: boolean;
  isLast: boolean;
  index: number;
  onCheckoff?: PlanItemCheckoffHandler;
  pending: boolean;
}) {
  const status = entry.item?.status ?? null;
  const accent = status === "skipped" ? "var(--color-ink-muted)" : accentVar(entry.category);
  const lineStyle: CSSProperties = {
    background: "var(--color-line-strong)",
    top: isFirst ? 16 : 0,
    bottom: isLast ? "auto" : -14,
    height: isLast ? 16 : undefined,
  };
  const cardStyle: CSSProperties = {
    borderLeftWidth: 3,
    borderLeftColor: accent,
    background: entry.fixed ? "transparent" : "var(--color-surface2)",
    borderStyle: entry.fixed ? "dashed" : "solid",
    animationDelay: `${index * 60}ms`,
    opacity: status ? 0.7 : undefined,
  };
  const item = entry.item;

  return (
    <div className="meridian-row grid grid-cols-[46px_26px_minmax(0,1fr)]">
      <div className="pr-2 pt-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">{entry.startTime}</div>
      <div className="relative">
        <span className="absolute left-1/2 w-0.5 -translate-x-1/2" style={lineStyle} />
        <span
          className="absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[3px] border-2"
          style={{ background: entry.fixed || status === "skipped" ? "var(--color-surface)" : accent, borderColor: accent }}
        />
        {status === "done" ? (
          <span aria-hidden className="absolute left-1/2 top-[7px] -translate-x-1/2 text-[11px] font-bold leading-none text-on-teal">
            ✓
          </span>
        ) : null}
      </div>
      <div className="ml-0.5 mb-3.5 rounded-[12px] border border-line px-3 py-2" style={cardStyle}>
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-[13px] font-semibold text-ink ${status ? "line-through decoration-2" : ""}`}>{entry.title}</span>
          <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
            {status === "done" ? <span className="mr-2 font-bold text-teal">Done</span> : null}
            {status === "skipped" ? <span className="mr-2">Skipped</span> : null}
            {durationLabel(entry.startTime, entry.endTime)}
          </span>
        </div>
        {entry.subtitle ? <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">{entry.subtitle}</p> : null}
        {item && onCheckoff && item.key ? (
          <div className="mt-2 flex gap-2">
            <CheckoffButton
              active={status === "done"}
              disabled={pending}
              label={status === "done" ? "Undo done" : "Done"}
              onClick={() => onCheckoff(item, "done")}
            />
            <CheckoffButton
              active={status === "skipped"}
              disabled={pending}
              label={status === "skipped" ? "Undo skip" : "Skip"}
              onClick={() => onCheckoff(item, "skipped")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NowMarker({ label }: { label: string }) {
  return (
    <div className="mb-3 grid grid-cols-[46px_26px_minmax(0,1fr)] items-center">
      <div className="pr-2 text-right font-mono text-[12px] font-bold tabular-nums" style={{ color: "var(--color-compass)" }}>
        {label}
      </div>
      <div className="relative flex h-4 items-center justify-center">
        <span
          className="h-3.5 w-3.5 rotate-45 rounded-[3px] border-2"
          style={{ background: "var(--color-compass)", borderColor: "var(--color-surface)", boxShadow: "0 0 0 3px var(--color-compass-soft)" }}
        />
      </div>
      <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, var(--color-compass), transparent)" }} />
    </div>
  );
}

export function TodayPlanMeridian({
  contextEvents,
  items,
  onCheckoff,
  pendingKey,
}: {
  contextEvents: TodayPlanContextEvent[];
  generatedAt?: string;
  items: PlannedItem[];
  /** Omit to show the plan read-only (e.g. a plan with no check-off date). */
  onCheckoff?: PlanItemCheckoffHandler;
  pendingKey?: string | null;
}) {
  const planEntries: Entry[] = items.map((item, index) => ({
    key: `plan-${index}-${item.startTime}`,
    startTime: item.startTime,
    endTime: item.endTime,
    startMinutes: toMinutes(item.startTime),
    title: item.title,
    subtitle: item.reason,
    category: item.type,
    fixed: false,
    item,
  }));
  const eventEntries: Entry[] = contextEvents.map((event) => ({
    key: `event-${event.id}`,
    startTime: event.startTime,
    endTime: event.endTime,
    startMinutes: toMinutes(event.startTime),
    title: event.title,
    subtitle: event.source === "schedule" ? "Recurring commitment" : "From your calendar",
    category: "commit",
    fixed: true,
  }));
  const entries = [...planEntries, ...eventEntries].sort((a, b) => a.startMinutes - b.startMinutes);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const rows: React.ReactNode[] = [];
  let nowPlaced = false;
  entries.forEach((entry, index) => {
    if (!nowPlaced && nowMinutes <= entry.startMinutes) {
      rows.push(<NowMarker key="now" label={nowLabel} />);
      nowPlaced = true;
    }
    rows.push(
      <MeridianRow
        entry={entry}
        index={index}
        isFirst={index === 0}
        isLast={index === entries.length - 1}
        key={entry.key}
        onCheckoff={onCheckoff}
        pending={Boolean(entry.item?.key) && entry.item?.key === pendingKey}
      />,
    );
  });
  if (!nowPlaced && entries.length > 0) {
    rows.push(<NowMarker key="now" label={nowLabel} />);
  }

  return <div className="rounded-[16px] border border-line bg-surface px-3 py-2 shadow-[var(--shadow-sm)]">{rows}</div>;
}
