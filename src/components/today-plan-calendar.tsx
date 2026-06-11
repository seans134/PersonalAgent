import type { PlannedItem } from "@/lib/planner";
import type { TodayPlanContextEvent } from "@/lib/planner/client-types";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT_PX = 72;
const DAY_MINUTES = 24 * 60;

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
  fitness: {
    backgroundColor: "#047857",
    borderColor: "#064e3b",
    color: "#ffffff",
  },
  wellness: {
    backgroundColor: "#0f766e",
    borderColor: "#134e4a",
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

function eventDurationMinutes(event: TodayPlanContextEvent) {
  return Math.max(0, toMinutes(event.endTime) - toMinutes(event.startTime));
}

function itemDurationMinutes(item: PlannedItem) {
  return Math.max(0, toMinutes(item.endTime) - toMinutes(item.startTime));
}

function minuteToTopPx(minutes: number) {
  return (minutes / 60) * HOUR_HEIGHT_PX;
}

function durationToHeightPx(durationMinutes: number) {
  return Math.max(34, (durationMinutes / 60) * HOUR_HEIGHT_PX);
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
  const dayHeight = minuteToTopPx(DAY_MINUTES);

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

        <div
          style={{ display: "grid", gridTemplateColumns: "4.5rem minmax(0, 1fr)", height: dayHeight }}
        >
          <div className="border-r border-zinc-200 bg-zinc-50">
            {hours.map((hour) => (
              <div
                className="border-t border-zinc-200 px-3 py-2 text-right text-xs font-medium text-zinc-500"
                key={hour}
                style={{ height: HOUR_HEIGHT_PX }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          <div className="bg-white" style={{ height: dayHeight, overflow: "hidden", position: "relative" }}>
            <div style={{ inset: 0, position: "absolute" }}>
              {hours.map((hour) => (
                <div
                  className="border-t border-zinc-200"
                  key={hour}
                  style={{ height: HOUR_HEIGHT_PX }}
                />
              ))}
            </div>

            {contextEvents.map((event) => {
              const start = toMinutes(event.startTime);
              const duration = eventDurationMinutes(event);

              return (
                <div
                  className="rounded-md border-l-4 px-3 py-2 text-left text-xs font-semibold leading-tight shadow-sm"
                  key={event.id}
                  style={{
                    ...CONTEXT_STYLE[event.source],
                    left: 8,
                    position: "absolute",
                    right: 8,
                    top: minuteToTopPx(start) + 4,
                    height: durationToHeightPx(duration) - 8,
                    zIndex: 1,
                  }}
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
                  <p className="mt-1 truncate font-medium">{duration} min - Existing schedule</p>
                </div>
              );
            })}

            {items.map((item, index) => {
              const start = toMinutes(item.startTime);
              const duration = itemDurationMinutes(item);

              return (
                <div
                  className="rounded-md border-l-4 px-3 py-2 text-left text-xs font-semibold leading-tight shadow-sm"
                  key={`${item.type}-${item.title}-${item.startTime}-${index}`}
                  style={{
                    ...TYPE_STYLE[item.type],
                    left: 8,
                    position: "absolute",
                    right: 8,
                    top: minuteToTopPx(start) + 4,
                    height: durationToHeightPx(duration) - 8,
                    zIndex: 2,
                  }}
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
                  <p className="mt-1 truncate font-medium">
                    {duration} min - {item.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
