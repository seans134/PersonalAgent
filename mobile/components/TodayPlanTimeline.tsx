import { StyleSheet, Text, View } from "react-native";
import type { PlannedItem } from "@personal-agent/core/planner/types";
import type { TodayPlanContextEvent } from "@personal-agent/core/planner/client-types";

type TimelineProps = {
  contextEvents: TodayPlanContextEvent[];
  items: PlannedItem[];
};

type BlockColor = {
  background: string;
  border: string;
  text: string;
};

const HOUR_HEIGHT = 64;
const GUTTER_WIDTH = 56;
const MIN_BLOCK_HEIGHT = 30;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;

// Mirrors the web today-plan calendar palette.
const itemColors: Record<PlannedItem["type"], BlockColor> = {
  goal: { background: "#0369a1", border: "#0c4a6e", text: "#ffffff" },
  focus: { background: "#4338ca", border: "#312e81", text: "#ffffff" },
  fitness: { background: "#047857", border: "#064e3b", text: "#ffffff" },
  wellness: { background: "#0f766e", border: "#134e4a", text: "#ffffff" },
  fallback: { background: "#b45309", border: "#78350f", text: "#ffffff" },
};

const contextColors: Record<TodayPlanContextEvent["source"], BlockColor> = {
  local: { background: "#57534e", border: "#292524", text: "#ffffff" },
  schedule: { background: "#7c2d12", border: "#431407", text: "#ffffff" },
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

/**
 * Bounds the visible range to the hours that actually contain something, padded
 * by an hour on each side, so a phone does not scroll through empty pre-dawn
 * space. Falls back to a daytime window when there is nothing to show.
 */
function visibleHourRange(items: PlannedItem[], contextEvents: TodayPlanContextEvent[]) {
  const starts: number[] = [];
  const ends: number[] = [];

  for (const item of items) {
    starts.push(toMinutes(item.startTime));
    ends.push(toMinutes(item.endTime));
  }
  for (const event of contextEvents) {
    starts.push(toMinutes(event.startTime));
    ends.push(toMinutes(event.endTime));
  }

  if (starts.length === 0) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }

  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  const startHour = Math.max(0, Math.floor(earliest / 60) - 1);
  const endHour = Math.min(24, Math.ceil(latest / 60) + 1);

  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

function TimelineBlock({
  colors,
  label,
  offsetMinutes,
  durationMinutes,
  subtitle,
  tag,
  zIndex,
}: {
  colors: BlockColor;
  label: string;
  offsetMinutes: number;
  durationMinutes: number;
  subtitle: string;
  tag: string;
  zIndex: number;
}) {
  const top = (offsetMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(MIN_BLOCK_HEIGHT, (durationMinutes / 60) * HOUR_HEIGHT) - 4;

  return (
    <View
      style={[
        styles.block,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          height,
          top: top + 2,
          zIndex,
        },
      ]}
    >
      <View style={styles.blockHeader}>
        <Text numberOfLines={1} style={[styles.blockTitle, { color: colors.text }]}>
          {label}
        </Text>
        <Text style={styles.blockTag}>{tag}</Text>
      </View>
      {height > 44 ? (
        <Text numberOfLines={1} style={[styles.blockSubtitle, { color: colors.text }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function TodayPlanTimeline({ contextEvents, items }: TimelineProps) {
  const { startHour, endHour } = visibleHourRange(items, contextEvents);
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
  const rangeStartMinutes = startHour * 60;
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT;

  return (
    <View style={styles.card}>
      <View style={styles.body}>
        <View style={styles.gutter}>
          {hours.map((hour) => (
            <View key={hour} style={styles.gutterCell}>
              <Text style={styles.gutterLabel}>{formatHour(hour)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.track, { height: bodyHeight }]}>
          {hours.map((hour) => (
            <View key={hour} style={styles.hourLine} />
          ))}

          {contextEvents.map((event) => (
            <TimelineBlock
              colors={contextColors[event.source]}
              durationMinutes={Math.max(0, toMinutes(event.endTime) - toMinutes(event.startTime))}
              key={event.id}
              label={`${event.startTime} ${event.title}`}
              offsetMinutes={toMinutes(event.startTime) - rangeStartMinutes}
              subtitle="Existing schedule"
              tag={event.source}
              zIndex={1}
            />
          ))}

          {items.map((item, index) => (
            <TimelineBlock
              colors={itemColors[item.type]}
              durationMinutes={Math.max(0, toMinutes(item.endTime) - toMinutes(item.startTime))}
              key={`${item.type}-${item.startTime}-${index}`}
              label={`${item.startTime} ${item.title}`}
              offsetMinutes={toMinutes(item.startTime) - rangeStartMinutes}
              subtitle={item.reason}
              tag={item.type}
              zIndex={2}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  body: {
    flexDirection: "row",
  },
  gutter: {
    backgroundColor: "#f8fafc",
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
    width: GUTTER_WIDTH,
  },
  gutterCell: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    height: HOUR_HEIGHT,
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  gutterLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  track: {
    flex: 1,
    position: "relative",
  },
  hourLine: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    height: HOUR_HEIGHT,
  },
  block: {
    borderLeftWidth: 4,
    borderRadius: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    right: 6,
  },
  blockHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
  },
  blockTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  blockTag: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    color: "#0f172a",
    fontSize: 9,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 1,
    textTransform: "uppercase",
  },
  blockSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.9,
  },
});
