import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CalendarEvent, ScheduleBlockCategory } from "@personal-agent/core/calendar";
import { CalendarEventModal, type EventFormState } from "./CalendarEventModal";
import { CalendarGrid, type SelectedSlot } from "./CalendarGrid";
import {
  buildCalendar,
  calendarViews,
  categoryOptions,
  eventColor,
  formatDay,
  formatMonth,
  fromDateKey,
  getMonthDays,
  getShiftedDate,
  getWeekDays,
  toDateKey,
  weekdayLabels,
  type CalendarView,
} from "../lib/calendar-view";
import { readCachedCalendar, writeCachedCalendar } from "../lib/cache";
import { errorHaptic, successHaptic, tapHaptic } from "../lib/haptics";
import {
  createMobileCalendarItem,
  deleteMobileCalendarItem,
  fetchMobileCalendar,
  updateMobileCalendarItem,
  type MobileCalendarItemInput,
  type MobileCalendarResponse,
} from "../lib/api";

type CalendarScreenProps = {
  accessToken: string;
};

type EditingTarget = {
  id: string;
  type: "single" | "recurring";
};

const dayStartTime = "08:00";
const dayEndTime = "20:00";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

export function CalendarScreen({ accessToken }: CalendarScreenProps) {
  const [snapshot, setSnapshot] = useState<MobileCalendarResponse | null>(null);
  const [view, setView] = useState<CalendarView>("month");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [hiddenCategories, setHiddenCategories] = useState<ScheduleBlockCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [cacheMessage, setCacheMessage] = useState("");
  const [form, setForm] = useState<EventFormState | null>(null);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const todayKey = toDateKey(new Date());

  const loadCalendar = useCallback(async () => {
    try {
      setLoadError("");
      const nextSnapshot = await fetchMobileCalendar(accessToken);
      setSnapshot(nextSnapshot);
      setCacheMessage("");
      await writeCachedCalendar(nextSnapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load calendar.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    let isMounted = true;

    async function loadCachedThenLive() {
      const cached = await readCachedCalendar();

      if (isMounted && cached) {
        setSnapshot(cached.value);
        setCacheMessage(`Showing saved calendar from ${new Date(cached.savedAt).toLocaleString()}.`);
        setLoading(false);
      }

      await loadCalendar();
    }

    void loadCachedThenLive();

    return () => {
      isMounted = false;
    };
  }, [loadCalendar]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadCalendar();
    setRefreshing(false);
  }

  const visibleSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (hiddenCategories.length === 0) return snapshot;

    return {
      ...snapshot,
      scheduleBlocks: snapshot.scheduleBlocks.filter(
        (block) => !hiddenCategories.includes(block.category),
      ),
      events: snapshot.events.filter((event) => !hiddenCategories.includes(event.category)),
    };
  }, [hiddenCategories, snapshot]);

  const calendar = useMemo(() => buildCalendar(visibleSnapshot), [visibleSnapshot]);

  const visibleMonth = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate],
  );
  const monthDays = useMemo(() => getMonthDays(visibleMonth), [visibleMonth]);
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const todayEvents = calendar.getEventsForDate(todayKey);
  const freeWindows = calendar.getFreeWindows(todayKey, dayStartTime, dayEndTime);

  const title =
    view === "month"
      ? formatMonth(visibleMonth)
      : view === "week"
        ? `Week of ${formatDay(weekDays[0])}`
        : formatDay(selectedDate);

  function shiftDate(direction: "previous" | "next") {
    tapHaptic();
    setSelectedDate((current) => getShiftedDate(current, view, direction));
  }

  function toggleCategory(category: ScheduleBlockCategory) {
    tapHaptic();
    setHiddenCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  function openCreateModal(slot: SelectedSlot) {
    tapHaptic();
    setModalError("");
    setEditingTarget(null);
    setForm({
      title: "",
      category: "personal",
      date: slot.dateKey,
      startTime: slot.startTime,
      endTime: slot.endTime,
      recurrence: "single",
    });
  }

  function openEditModal(event: CalendarEvent) {
    tapHaptic();
    setModalError("");
    setEditingTarget(
      event.source === "recurring_schedule" && event.sourceId
        ? { id: event.sourceId, type: "recurring" }
        : { id: event.id, type: "single" },
    );
    setForm({
      title: event.title,
      category: event.category,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      recurrence: event.source === "recurring_schedule" ? "weekly" : "single",
    });
  }

  function closeModal() {
    setForm(null);
    setEditingTarget(null);
    setModalError("");
  }

  function updateForm(patch: Partial<EventFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function validate(nextForm: EventFormState) {
    if (!nextForm.title.trim()) return "Add a title before saving.";
    if (!datePattern.test(nextForm.date)) return "Date must use YYYY-MM-DD format.";
    if (!timePattern.test(nextForm.startTime) || !timePattern.test(nextForm.endTime)) {
      return "Times must use HH:MM format.";
    }
    if (nextForm.endTime <= nextForm.startTime) return "End time must be after start time.";
    return "";
  }

  async function handleSubmit() {
    if (!form) return;

    const validationError = validate(form);
    if (validationError) {
      setModalError(validationError);
      errorHaptic();
      return;
    }

    setSaving(true);
    setModalError("");

    const common = {
      title: form.title.trim(),
      category: form.category,
      startTime: form.startTime,
      endTime: form.endTime,
    };
    const input: MobileCalendarItemInput =
      form.recurrence === "weekly"
        ? {
            ...common,
            kind: "block",
            daysOfWeek: [fromDateKey(form.date).getDay()],
            timezone: localTimezone(),
          }
        : { ...common, kind: "event", date: form.date };
    const nextType = form.recurrence === "weekly" ? "recurring" : "single";

    try {
      if (editingTarget && editingTarget.type !== nextType) {
        // Switching between one-off and weekly moves the item to the other table.
        await createMobileCalendarItem(accessToken, input);
        await deleteMobileCalendarItem(
          accessToken,
          editingTarget.type === "recurring" ? "block" : "event",
          editingTarget.id,
        );
      } else if (editingTarget) {
        await updateMobileCalendarItem(accessToken, { ...input, id: editingTarget.id });
      } else {
        await createMobileCalendarItem(accessToken, input);
      }

      successHaptic();
      closeModal();
      await loadCalendar();
    } catch (error) {
      errorHaptic();
      setModalError(error instanceof Error ? error.message : "Unable to save event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingTarget) return;

    setDeleting(true);
    setModalError("");

    try {
      await deleteMobileCalendarItem(
        accessToken,
        editingTarget.type === "recurring" ? "block" : "event",
        editingTarget.id,
      );
      successHaptic();
      closeModal();
      await loadCalendar();
    } catch (error) {
      errorHaptic();
      setModalError(error instanceof Error ? error.message : "Unable to remove event.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={["#0f766e"]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor="#0f766e"
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Local calendar</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            Tap a day or hour to add an event. Tap an event to edit it. Changes stay synchronized
            with the web app and daily planner.
          </Text>
        </View>

        <View style={styles.controlRow}>
          <View style={styles.segmentGroup}>
            {calendarViews.map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  tapHaptic();
                  setView(option);
                }}
                style={[styles.segmentButton, view === option && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, view === option && styles.segmentTextActive]}>
                  {titleCase(option)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.segmentGroup}>
            <Pressable onPress={() => shiftDate("previous")} style={styles.navButton}>
              <Text style={styles.navText}>Prev</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                tapHaptic();
                setSelectedDate(new Date());
              }}
              style={styles.navButton}
            >
              <Text style={styles.navText}>Today</Text>
            </Pressable>
            <Pressable onPress={() => shiftDate("next")} style={styles.navButton}>
              <Text style={styles.navText}>Next</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.legendRow}>
          {categoryOptions.map((category) => {
            const colors = eventColor(category);
            const isHidden = hiddenCategories.includes(category);

            return (
              <Pressable
                key={category}
                onPress={() => toggleCategory(category)}
                style={[
                  styles.legendChip,
                  { borderColor: colors.border, backgroundColor: colors.background },
                  isHidden && styles.legendChipOff,
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: colors.text }, isHidden && styles.swatchOff]} />
                <Text style={[styles.legendText, { color: colors.text }, isHidden && styles.legendTextOff]}>
                  {titleCase(category)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {cacheMessage ? <Text style={styles.cacheMessage}>{cacheMessage}</Text> : null}
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {loading ? <Text style={styles.empty}>Loading calendar...</Text> : null}

        <CalendarGrid
          calendar={calendar}
          monthDays={monthDays}
          onEditEvent={openEditModal}
          onSelectSlot={openCreateModal}
          selectedDate={selectedDate}
          todayKey={todayKey}
          view={view}
          weekDays={weekDays}
        />

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Today</Text>
          <Text style={styles.panelTitle}>{formatDay(new Date())}</Text>

          {todayEvents.length === 0 ? (
            <Text style={styles.empty}>Nothing scheduled today.</Text>
          ) : (
            <View style={styles.todayList}>
              {todayEvents.map((event) => {
                const colors = eventColor(event.category);

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => openEditModal(event)}
                    style={[
                      styles.todayItem,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.todayItemTitle, { color: colors.text }]}>{event.title}</Text>
                    <Text style={[styles.todayItemMeta, { color: colors.text }]}>
                      {event.startTime} - {event.endTime}
                      {event.source === "recurring_schedule" ? " | Weekly" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.freeSection}>
            <Text style={styles.freeTitle}>
              Free windows ({dayStartTime} - {dayEndTime})
            </Text>
            {freeWindows.length === 0 ? (
              <Text style={styles.empty}>No free windows today.</Text>
            ) : (
              freeWindows.map((window) => (
                <View key={`${window.startTime}-${window.endTime}`} style={styles.freeWindow}>
                  <Text style={styles.freeWindowText}>
                    {window.startTime} - {window.endTime}
                  </Text>
                  <Text style={styles.freeWindowMinutes}>{window.durationMinutes} min</Text>
                </View>
              ))
            )}
          </View>

          {snapshot ? (
            <Text style={styles.counts}>
              {snapshot.scheduleBlocks.length} recurring blocks | {snapshot.events.length} local
              events
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {form ? (
        <CalendarEventModal
          deleting={deleting}
          error={modalError}
          form={form}
          isEditing={editingTarget !== null}
          onChange={updateForm}
          onClose={closeModal}
          onDelete={handleDelete}
          onSubmit={handleSubmit}
          saving={saving}
          weekdayLabel={
            datePattern.test(form.date) ? weekdayLabels[fromDateKey(form.date).getDay()] : "this day"
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  body: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  segmentGroup: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  segmentButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  segmentActive: {
    backgroundColor: "#111827",
  },
  segmentText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  navButton: {
    alignItems: "center",
    borderLeftColor: "#e2e8f0",
    borderLeftWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  navText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  legendChipOff: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  swatch: {
    borderRadius: 3,
    height: 9,
    width: 9,
  },
  swatchOff: {
    backgroundColor: "#cbd5e1",
  },
  legendText: {
    fontSize: 12,
    fontWeight: "800",
  },
  legendTextOff: {
    color: "#94a3b8",
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  panelLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  panelTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
  },
  todayList: {
    gap: 8,
  },
  todayItem: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  todayItemTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  todayItemMeta: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  freeSection: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14,
  },
  freeTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  freeWindow: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  freeWindowText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  freeWindowMinutes: {
    color: "#64748b",
    fontSize: 13,
  },
  counts: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    color: "#64748b",
    fontSize: 12,
    paddingTop: 12,
  },
  cacheMessage: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
});
