import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PlannedItem } from "@personal-agent/core/planner/types";
import type { TodayPlanContextEvent } from "@personal-agent/core/planner/client-types";
import { useTheme } from "../lib/theme";
import type { ThemeColors } from "../lib/theme";

type TimelineProps = {
  contextEvents: TodayPlanContextEvent[];
  items: PlannedItem[];
};

// How an entry maps onto the category color system. Plan items carry their own
// type; calendar/context events are fixed commitments (neutral, dashed).
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
};

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

function categoryColor(colors: ThemeColors, category: EntryCategory): string {
  switch (category) {
    case "goal":
      return colors.goal;
    case "focus":
      return colors.focus;
    case "fitness":
      return colors.fitness;
    case "wellness":
      return colors.wellness;
    case "commit":
      return colors.commit;
    case "fallback":
    default:
      return colors.inkMuted;
  }
}

function MeridianRow({
  entry,
  isFirst,
  isLast,
}: {
  entry: Entry;
  isFirst: boolean;
  isLast: boolean;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const accent = categoryColor(colors, entry.category);

  return (
    <View style={styles.row}>
      <Text style={[theme.text("monoTime", "inkMuted"), styles.time]}>{entry.startTime}</Text>

      <View style={styles.rail}>
        {/* the meridian line — capped at the node for the first and last entry */}
        <View
          style={[
            styles.line,
            { backgroundColor: colors.lineStrong },
            isFirst && styles.lineFromNode,
            isLast && styles.lineToNode,
          ]}
        />
        <View
          style={[
            styles.node,
            {
              backgroundColor: entry.fixed ? colors.surface : accent,
              borderColor: accent,
            },
          ]}
        />
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: entry.fixed ? "transparent" : colors.surface2,
            borderColor: colors.line,
            borderLeftColor: accent,
            borderStyle: entry.fixed ? "dashed" : "solid",
          },
        ]}
      >
        <View style={styles.cardHead}>
          <Text numberOfLines={1} style={[theme.text("label", "ink"), styles.cardTitle]}>
            {entry.title}
          </Text>
          <Text style={theme.text("monoTime", "inkMuted")}>{durationLabel(entry.startTime, entry.endTime)}</Text>
        </View>
        {entry.subtitle ? (
          <Text numberOfLines={2} style={theme.text("body", "inkMuted")}>
            {entry.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function NowMarker({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.nowRow}>
      <Text style={[styles.nowLabel, { color: colors.compass }]}>{label}</Text>
      <View style={styles.nowRail}>
        <View style={[styles.needle, { backgroundColor: colors.compass, borderColor: colors.surface }]} />
      </View>
      <View style={[styles.nowLine, { backgroundColor: colors.compass }]} />
    </View>
  );
}

export function TodayPlanTimeline({ contextEvents, items }: TimelineProps) {
  const theme = useTheme();
  const { colors } = theme;

  const entries = useMemo<Entry[]>(() => {
    const planEntries: Entry[] = items.map((item, index) => ({
      key: `plan-${index}-${item.startTime}`,
      startTime: item.startTime,
      endTime: item.endTime,
      startMinutes: toMinutes(item.startTime),
      title: item.title,
      subtitle: item.reason,
      category: item.type,
      fixed: false,
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
    return [...planEntries, ...eventEntries].sort((a, b) => a.startMinutes - b.startMinutes);
  }, [items, contextEvents]);

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
        isFirst={index === 0}
        isLast={index === entries.length - 1}
        key={entry.key}
      />,
    );
  });
  if (!nowPlaced && entries.length > 0) {
    rows.push(<NowMarker key="now" label={nowLabel} />);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {rows}
    </View>
  );
}

const RAIL_WIDTH = 26;
const NODE = 12;

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: "row",
    paddingBottom: 14,
  },
  time: {
    width: 46,
    textAlign: "right",
    paddingRight: 8,
    paddingTop: 10,
  },
  rail: {
    width: RAIL_WIDTH,
    position: "relative",
  },
  line: {
    position: "absolute",
    left: RAIL_WIDTH / 2 - 1,
    width: 2,
    top: 0,
    bottom: -14,
  },
  lineFromNode: {
    top: 16,
  },
  lineToNode: {
    bottom: undefined,
    height: 16,
  },
  node: {
    position: "absolute",
    left: RAIL_WIDTH / 2 - NODE / 2,
    top: 10,
    width: NODE,
    height: NODE,
    borderRadius: 3,
    borderWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginLeft: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
  },
  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  nowLabel: {
    width: 46,
    textAlign: "right",
    paddingRight: 8,
    fontFamily: "SpaceMono_700Bold",
    fontSize: 12,
  },
  nowRail: {
    width: RAIL_WIDTH,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  needle: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
  nowLine: {
    flex: 1,
    height: 2,
    opacity: 0.55,
    marginLeft: 2,
  },
});
