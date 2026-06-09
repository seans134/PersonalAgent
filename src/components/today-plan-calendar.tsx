import type { PlannedItem } from "@/lib/planner";
import type { TodayPlanContextEvent } from "@/lib/planner/client-types";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TYPE_STYLE: Record<PlannedItem["type"], { backgroundColor: string; borderColor: string; color: string }> = {
  goal: {
    backgroundColor: "#0369a1",
    borderColor: "#0c4a6e",
    color: "#ffffff",
  },
  focus: {
    backgroundColor: "#4338ca",
    borderColor: "#312e81",
    color: "#ffffff",
  },
  wellbeing: {
    backgroundColor: "#047857",
    borderColor: "#064e3b",
    color: "#ffffff",
  },
  fallback: {
    backgroundColor: "#b45309",
    borderColor: "#78350f",
    color: "#ffffff",
  },
};

const CONTEXT_STYLE: Record<TodayPlanContextEvent["source"], { backgroundColor: string; borderColor: string; color: string }> = {
  google: {
    backgroundColor: "#334155",
    borderColor: "#0f172a",
    color: "#ffffff",
  },
  local: {
    backgroundColor: "#57534e",
    borderColor: "#292524",
    color: "#ffffff",
  },
  schedule: {
    backgroundColor: "#7c2d12",
    borderColor: "#431407",
    color: "#ffffff",
  },
};

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatDay(value: Date) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function itemOverlapsHour(item: PlannedItem, hour: number) {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  return toMinutes(item.startTime) < hourEnd && toMinutes(item.endTime) > hourStart;
}

function contextEventOverlapsHour(event: TodayPlanContextEvent, hour: number) {
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  return toMinutes(event.startTime) < hourEnd && toMinutes(event.endTime) > hourStart;
}

function itemDurationMinutes(item: PlannedItem) {
  return Math.max(0, toMinutes(item.endTime) - toMinutes(item.startTime));
}

export function TodayPlanCalendar({
  contextEvents,
  generatedAt,
  items,
}: {
  contextEvents: TodayPlanContextEvent[];
  generatedAt: string;
  items: PlannedItem[];
}) {
  const generatedDate = new Date(generatedAt);
  const day = Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate;
  const hours = Array.from({ length: 24 }, (_, index) => index);

  return (
    <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="min-w-[34rem]">
        <div
          className="border-b border-zinc-200 bg-zinc-50"
          style={{ display: "grid", gridTemplateColumns: "4.5rem minmax(0, 1fr)" }}
        >
          <div className="border-r border-zinc-200 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Time
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{weekdayLabels[day.getDay()]}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-800">{formatDay(day)}</p>
          </div>
        </div>

        {hours.map((hour) => {
          const hourContextEvents = contextEvents.filter((event) => contextEventOverlapsHour(event, hour));
          const hourItems = items.filter((item) => itemOverlapsHour(item, hour));
          const hasEvents = hourContextEvents.length > 0 || hourItems.length > 0;

          return (
            <div
              className="border-t border-zinc-200"
              key={hour}
              style={{ display: "grid", gridTemplateColumns: "4.5rem minmax(0, 1fr)" }}
            >
              <div className="border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-xs font-medium text-zinc-500">
                {formatHour(hour)}
              </div>
              {!hasEvents ? (
                <div className="min-h-11 bg-white p-1" />
              ) : (
                <div className="min-h-11 bg-white p-1 text-left">
                  <div className="space-y-1">
                    {hourContextEvents.map((event) => (
                      <div
                        className="w-full rounded-md border-l-4 px-3 py-2 text-left text-xs font-semibold leading-tight shadow-sm"
                        key={`${event.id}-${hour}`}
                        style={CONTEXT_STYLE[event.source]}
                        title={`${event.startTime} - ${event.endTime} ${event.title}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">
                            {event.startTime} {event.title}
                          </span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-950">
                            {event.source}
                          </span>
                        </div>
                        <p className="mt-1 font-medium">Existing schedule</p>
                      </div>
                    ))}
                    {hourItems.map((item, index) => (
                      <div
                        className="w-full rounded-md border-l-4 px-3 py-2 text-left text-xs font-semibold leading-tight shadow-sm"
                        key={`${item.type}-${item.title}-${item.startTime}-${hour}-${index}`}
                        style={TYPE_STYLE[item.type]}
                        title={`${item.startTime} - ${item.endTime} ${item.title}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">
                            {item.startTime} {item.title}
                          </span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-950">
                            {item.type}
                          </span>
                        </div>
                        <p className="mt-1 font-medium">
                          {itemDurationMinutes(item)} min - {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
