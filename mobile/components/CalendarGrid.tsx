import { useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import type { Calendar, CalendarEvent } from "@personal-agent/core/calendar";
import {
  eventColor,
  eventOverlapsHour,
  formatDay,
  formatHour,
  fromDateKey,
  toDateKey,
  toTimeString,
  weekdayLabels,
  type CalendarView,
} from "../lib/calendar-view";

export type SelectedSlot = {
  dateKey: string;
  startTime: string;
  endTime: string;
};

type GridProps = {
  calendar: Calendar;
  monthDays: Array<Date | null>;
  onEditEvent: (event: CalendarEvent) => void;
  onSelectSlot: (slot: SelectedSlot) => void;
  selectedDate: Date;
  todayKey: string;
  view: CalendarView;
  weekDays: Date[];
};

const hours = Array.from({ length: 24 }, (_, index) => index);
const hourColumnWidth = 62;
const dayColumnWidth = 104;

function slotForHour(dateKey: string, hour: number): SelectedSlot {
  return {
    dateKey,
    startTime: toTimeString(hour),
    endTime: hour === 23 ? "23:59" : toTimeString(hour + 1),
  };
}

function EventPill({
  compact,
  event,
  onEditEvent,
}: {
  compact?: boolean;
  event: CalendarEvent;
  onEditEvent: (event: CalendarEvent) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const colors = eventColor(event.category);

  return (
    <Pressable
      onPress={() => onEditEvent(event)}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.background, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.pillText, compact && styles.pillTextCompact, { color: colors.text }]}>
        {event.startTime} {event.title}
      </Text>
    </Pressable>
  );
}

function MonthCalendar({
  calendar,
  monthDays,
  onEditEvent,
  onSelectSlot,
  todayKey,
}: Pick<GridProps, "calendar" | "monthDays" | "onEditEvent" | "onSelectSlot" | "todayKey">) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <View style={styles.monthHeaderRow}>
        {weekdayLabels.map((label) => (
          <View key={label} style={styles.monthHeaderCell}>
            <Text style={styles.monthHeaderText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {monthDays.map((day, index) => {
          if (!day) {
            return <View key={`blank-${index}`} style={[styles.monthCell, styles.monthCellBlank]} />;
          }

          const dateKey = toDateKey(day);
          const events = calendar.getEventsForDate(dateKey);
          const isToday = dateKey === todayKey;

          return (
            <Pressable
              key={dateKey}
              onPress={() => onSelectSlot({ dateKey, startTime: "09:00", endTime: "10:00" })}
              style={({ pressed }) => [
                styles.monthCell,
                isToday && styles.todayCell,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.dayNumberWrap, isToday && styles.dayNumberWrapToday]}>
                <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{day.getDate()}</Text>
              </View>

              <View style={styles.monthCellEvents}>
                {events.slice(0, 3).map((event) => (
                  <EventPill compact event={event} key={event.id} onEditEvent={onEditEvent} />
                ))}
                {events.length > 3 ? (
                  <Text style={styles.moreText}>+{events.length - 3} more</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WeekCalendar({
  calendar,
  onEditEvent,
  onSelectSlot,
  todayKey,
  weekDays,
}: Pick<GridProps, "calendar" | "onEditEvent" | "onSelectSlot" | "todayKey" | "weekDays">) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.timeHeaderRow}>
            <View style={[styles.timeGutter, styles.timeHeaderCell]}>
              <Text style={styles.timeHeaderLabel}>Time</Text>
            </View>
            {weekDays.map((day) => {
              const dateKey = toDateKey(day);
              const isToday = dateKey === todayKey;

              return (
                <View
                  key={dateKey}
                  style={[styles.dayColumn, styles.timeHeaderCell, isToday && styles.todayCell]}
                >
                  <Text style={styles.monthHeaderText}>{weekdayLabels[day.getDay()]}</Text>
                  <Text style={[styles.dayHeaderNumber, isToday && styles.dayHeaderNumberToday]}>
                    {day.getDate()}
                  </Text>
                </View>
              );
            })}
          </View>

          {hours.map((hour) => (
            <View key={hour} style={styles.hourRow}>
              <View style={[styles.timeGutter, styles.hourCell]}>
                <Text style={styles.hourLabel}>{formatHour(hour)}</Text>
              </View>
              {weekDays.map((day) => {
                const dateKey = toDateKey(day);
                const isToday = dateKey === todayKey;
                const hourEvents = calendar
                  .getEventsForDate(dateKey)
                  .filter((event) => eventOverlapsHour(event, hour));

                return (
                  <Pressable
                    key={`${dateKey}-${hour}`}
                    onPress={() => onSelectSlot(slotForHour(dateKey, hour))}
                    style={({ pressed }) => [
                      styles.dayColumn,
                      styles.hourCell,
                      isToday && styles.todayCell,
                      pressed && styles.pressed,
                    ]}
                  >
                    {hourEvents.map((event) => (
                      <EventPill
                        compact
                        event={event}
                        key={`${event.id}-${hour}`}
                        onEditEvent={onEditEvent}
                      />
                    ))}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DayCalendar({
  calendar,
  onEditEvent,
  onSelectSlot,
  selectedDate,
}: Pick<GridProps, "calendar" | "onEditEvent" | "onSelectSlot" | "selectedDate">) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const dateKey = toDateKey(selectedDate);
  const day = fromDateKey(dateKey);
  const events = calendar.getEventsForDate(dateKey);

  return (
    <View style={styles.card}>
      <View style={styles.timeHeaderRow}>
        <View style={[styles.timeGutter, styles.timeHeaderCell]}>
          <Text style={styles.timeHeaderLabel}>Time</Text>
        </View>
        <View style={[styles.dayFlexColumn, styles.timeHeaderCell]}>
          <Text style={styles.monthHeaderText}>{weekdayLabels[day.getDay()]}</Text>
          <Text style={styles.dayHeaderNumber}>{formatDay(day)}</Text>
        </View>
      </View>

      {hours.map((hour) => {
        const hourEvents = events.filter((event) => eventOverlapsHour(event, hour));

        return (
          <View key={hour} style={styles.hourRow}>
            <View style={[styles.timeGutter, styles.hourCell]}>
              <Text style={styles.hourLabel}>{formatHour(hour)}</Text>
            </View>
            <Pressable
              onPress={() => onSelectSlot(slotForHour(dateKey, hour))}
              style={({ pressed }) => [styles.dayFlexColumn, styles.hourCell, pressed && styles.pressed]}
            >
              {hourEvents.map((event) => (
                <EventPill event={event} key={`${event.id}-${hour}`} onEditEvent={onEditEvent} />
              ))}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function CalendarGrid(props: GridProps) {
  if (props.view === "day") {
    return (
      <DayCalendar
        calendar={props.calendar}
        onEditEvent={props.onEditEvent}
        onSelectSlot={props.onSelectSlot}
        selectedDate={props.selectedDate}
      />
    );
  }

  if (props.view === "week") {
    return (
      <WeekCalendar
        calendar={props.calendar}
        onEditEvent={props.onEditEvent}
        onSelectSlot={props.onSelectSlot}
        todayKey={props.todayKey}
        weekDays={props.weekDays}
      />
    );
  }

  return (
    <MonthCalendar
      calendar={props.calendar}
      monthDays={props.monthDays}
      onEditEvent={props.onEditEvent}
      onSelectSlot={props.onSelectSlot}
      todayKey={props.todayKey}
    />
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  monthHeaderRow: {
    backgroundColor: colors.paper,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  monthHeaderCell: {
    alignItems: "center",
    paddingVertical: 8,
    width: `${100 / 7}%`,
  },
  monthHeaderText: {
    ...theme.text("monoLabel", "inkMuted"),
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  monthCell: {
    borderRightColor: colors.surface2,
    borderRightWidth: 1,
    borderTopColor: colors.surface2,
    borderTopWidth: 1,
    minHeight: 96,
    padding: 3,
    width: `${100 / 7}%`,
  },
  monthCellBlank: {
    backgroundColor: colors.paper,
  },
  monthCellEvents: {
    gap: 2,
  },
  todayCell: {
    backgroundColor: colors.surface2,
  },
  dayNumberWrap: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 11,
    height: 22,
    justifyContent: "center",
    marginBottom: 3,
    width: 22,
  },
  dayNumberWrapToday: {
    backgroundColor: colors.ink,
  },
  dayNumber: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  dayNumberToday: {
    color: colors.surface,
  },
  moreText: {
    color: colors.inkMuted,
    fontSize: 10,
    fontWeight: "700",
    paddingLeft: 2,
  },
  timeHeaderRow: {
    backgroundColor: colors.paper,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  timeHeaderCell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  timeHeaderLabel: {
    ...theme.text("monoLabel", "inkMuted"),
  },
  dayHeaderNumber: {
    ...theme.text("body", "ink"),
    marginTop: 2,
  },
  dayHeaderNumberToday: {
    color: colors.ink,
  },
  hourRow: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
  },
  hourCell: {
    minHeight: 44,
    padding: 3,
  },
  hourLabel: {
    ...theme.text("monoTime", "inkMuted"),
    textAlign: "right",
  },
  timeGutter: {
    backgroundColor: colors.paper,
    borderRightColor: colors.line,
    borderRightWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 6,
    width: hourColumnWidth,
  },
  dayColumn: {
    borderRightColor: colors.surface2,
    borderRightWidth: 1,
    gap: 2,
    width: dayColumnWidth,
  },
  dayFlexColumn: {
    flex: 1,
    gap: 2,
  },
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pillTextCompact: {
    fontSize: 10,
  },
  pressed: {
    opacity: 0.65,
  },
});
}
