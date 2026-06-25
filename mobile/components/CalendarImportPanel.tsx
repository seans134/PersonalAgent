import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchMobileCalendar,
  type MobileCalendarCategory,
  type MobileCalendarEvent,
  type MobileCalendarResponse,
  type MobileScheduleBlock,
} from "../lib/api";
import { readCachedCalendar, writeCachedCalendar } from "../lib/cache";

type CalendarImportPanelProps = {
  accessToken: string;
  reloadKey?: number;
};

type TodayCalendarItem = {
  id: string;
  title: string;
  category: MobileCalendarCategory;
  startTime: string;
  endTime: string;
  source: "manual" | "recurring";
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const categoryLabels: Record<MobileCalendarCategory, string> = {
  school: "School",
  work: "Work",
  study: "Study",
  personal: "Personal",
  unavailable: "Unavailable",
};

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventForToday(event: MobileCalendarEvent, todayKey: string): TodayCalendarItem | null {
  if (event.date !== todayKey) {
    return null;
  }

  return {
    id: event.id,
    title: event.title,
    category: event.category,
    startTime: event.startTime,
    endTime: event.endTime,
    source: "manual",
  };
}

function blockForToday(block: MobileScheduleBlock, dayOfWeek: number): TodayCalendarItem | null {
  if (!block.daysOfWeek.includes(dayOfWeek)) {
    return null;
  }

  return {
    id: block.id,
    title: block.title,
    category: block.category,
    startTime: block.startTime,
    endTime: block.endTime,
    source: "recurring",
  };
}

function categoryStyle(category: MobileCalendarCategory) {
  if (category === "school") return styles.schoolPill;
  if (category === "work") return styles.workPill;
  if (category === "study") return styles.studyPill;
  if (category === "personal") return styles.personalPill;
  return styles.unavailablePill;
}

export function CalendarImportPanel({ accessToken, reloadKey = 0 }: CalendarImportPanelProps) {
  const [calendar, setCalendar] = useState<MobileCalendarResponse | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const todayItems = useMemo(() => {
    if (!calendar) {
      return [];
    }

    return [
      ...calendar.scheduleBlocks
        .map((block) => blockForToday(block, today.getDay()))
        .filter((item): item is TodayCalendarItem => item !== null),
      ...calendar.events
        .map((event) => eventForToday(event, todayKey))
        .filter((item): item is TodayCalendarItem => item !== null),
    ].sort((first, second) => {
      if (first.startTime !== second.startTime) {
        return first.startTime < second.startTime ? -1 : 1;
      }

      return first.title.localeCompare(second.title);
    });
  }, [calendar, today, todayKey]);

  const loadCalendar = useCallback(async () => {
    setMessage(undefined);
    setLoading(true);

    try {
      const nextCalendar = await fetchMobileCalendar(accessToken);
      setCalendar(nextCalendar);
      setCacheMessage("Saved for offline viewing.");
      await writeCachedCalendar(nextCalendar);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load calendar.");
    }

    setLoading(false);
  }, [accessToken]);

  const loadCachedCalendar = useCallback(async () => {
    const cachedCalendar = await readCachedCalendar();

    if (cachedCalendar) {
      setCalendar(cachedCalendar.value);
      setCacheMessage(`Showing saved calendar from ${new Date(cachedCalendar.savedAt).toLocaleString()}.`);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCachedCalendar();
      void loadCalendar();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCachedCalendar, loadCalendar, reloadKey]);

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.panelLabel}>Today</Text>
          <Text style={styles.panelBody}>
            Shared classes, recurring blocks, and local events.
          </Text>
        </View>
        <Pressable
          disabled={loading}
          onPress={loadCalendar}
          style={({ pressed }) => [styles.refreshButton, (pressed || loading) && styles.buttonPressed]}
        >
          {loading ? <ActivityIndicator color="#0f766e" /> : <Text style={styles.refreshText}>Refresh</Text>}
        </Pressable>
      </View>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {calendar ? (
        <>
          {cacheMessage ? <Text style={styles.cacheMessage}>{cacheMessage}</Text> : null}
          <View style={styles.visibilityGrid}>
            {(Object.keys(categoryLabels) as MobileCalendarCategory[]).map((category) => (
              <View
                key={category}
                style={[
                  styles.visibilityPill,
                  calendar.visibility[category] ? styles.visibilityOn : styles.visibilityOff,
                ]}
              >
                <Text
                  style={[
                    styles.visibilityText,
                    calendar.visibility[category] ? styles.visibilityTextOn : styles.visibilityTextOff,
                  ]}
                >
                  {categoryLabels[category]}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.subhead}>
            {weekdayLabels[today.getDay()]} {todayKey}
          </Text>

          {todayItems.length > 0 ? (
            <View style={styles.items}>
              {todayItems.map((item) => (
                <View key={`${item.source}-${item.id}`} style={styles.item}>
                  <View style={[styles.categoryBar, categoryStyle(item.category)]} />
                  <View style={styles.itemBody}>
                    <Text style={styles.time}>
                      {item.startTime} - {item.endTime}
                    </Text>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemMeta}>
                      {categoryLabels[item.category]} | {item.source === "recurring" ? "Recurring class/block" : "Local event"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No imported classes or local events today.</Text>
          )}

          <Text style={styles.counts}>
            {calendar.scheduleBlocks.length} recurring blocks | {calendar.events.length} local events
          </Text>
        </>
      ) : loading ? (
        <Text style={styles.empty}>Loading calendar...</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
  },
  panelLabel: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  panelBody: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  refreshButton: {
    alignItems: "center",
    borderColor: "#0f766e",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  refreshText: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  cacheMessage: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 12,
    padding: 10,
  },
  visibilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  visibilityPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  visibilityOn: {
    backgroundColor: "#ecfdf5",
    borderColor: "#99f6e4",
  },
  visibilityOff: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
  visibilityText: {
    fontSize: 12,
    fontWeight: "800",
  },
  visibilityTextOn: {
    color: "#0f766e",
  },
  visibilityTextOff: {
    color: "#64748b",
  },
  subhead: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 18,
  },
  items: {
    gap: 10,
    marginTop: 10,
  },
  item: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  categoryBar: {
    width: 5,
  },
  schoolPill: {
    backgroundColor: "#7c3aed",
  },
  workPill: {
    backgroundColor: "#2563eb",
  },
  studyPill: {
    backgroundColor: "#d97706",
  },
  personalPill: {
    backgroundColor: "#059669",
  },
  unavailablePill: {
    backgroundColor: "#64748b",
  },
  itemBody: {
    flex: 1,
    padding: 12,
  },
  time: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
  },
  itemTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  counts: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
  },
});
