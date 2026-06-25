import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createMobileCalendarItem,
  deleteMobileCalendarItem,
  fetchMobileCalendar,
  updateMobileCalendarItem,
  type MobileCalendarCategory,
  type MobileCalendarEvent,
  type MobileScheduleBlock,
} from "../lib/api";

type CalendarEditorPanelProps = {
  accessToken: string;
  onChanged: () => void;
};

type FormState = {
  id: string | null;
  kind: "event" | "block";
  title: string;
  category: MobileCalendarCategory;
  date: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const categories: MobileCalendarCategory[] = ["school", "work", "study", "personal", "unavailable"];
const weekdays = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialForm(): FormState {
  const today = new Date();
  return {
    id: null,
    kind: "event",
    title: "",
    category: "personal",
    date: dateKey(today),
    daysOfWeek: [today.getDay()],
    startTime: "09:00",
    endTime: "10:00",
  };
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CalendarEditorPanel({ accessToken, onChanged }: CalendarEditorPanelProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [events, setEvents] = useState<MobileCalendarEvent[]>([]);
  const [blocks, setBlocks] = useState<MobileScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setError(null);
      const calendar = await fetchMobileCalendar(accessToken);
      setEvents(calendar.events);
      setBlocks(calendar.scheduleBlocks);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load calendar items.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  function resetForm(kind = form.kind) {
    setForm({ ...initialForm(), kind });
  }

  function toggleWeekday(day: number) {
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day].sort(),
    }));
  }

  function editEvent(event: MobileCalendarEvent) {
    setForm({
      id: event.id,
      kind: "event",
      title: event.title,
      category: event.category,
      date: event.date,
      daysOfWeek: [],
      startTime: event.startTime,
      endTime: event.endTime,
    });
    setMessage(null);
    setError(null);
  }

  function editBlock(block: MobileScheduleBlock) {
    setForm({
      id: block.id,
      kind: "block",
      title: block.title,
      category: block.category,
      date: dateKey(new Date()),
      daysOfWeek: block.daysOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
    });
    setMessage(null);
    setError(null);
  }

  async function saveItem() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const common = {
        title: form.title.trim(),
        category: form.category,
        startTime: form.startTime,
        endTime: form.endTime,
      };
      const input = form.kind === "event"
        ? { ...common, kind: "event" as const, date: form.date }
        : {
            ...common,
            kind: "block" as const,
            daysOfWeek: form.daysOfWeek,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
          };

      if (form.id) {
        await updateMobileCalendarItem(accessToken, { ...input, id: form.id });
      } else {
        await createMobileCalendarItem(accessToken, input);
      }

      setMessage(form.id ? "Calendar item updated." : "Calendar item added.");
      resetForm(form.kind);
      await loadItems();
      onChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save calendar item.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(kind: "event" | "block", id: string) {
    setRemovingId(id);
    setError(null);
    setMessage(null);

    try {
      await deleteMobileCalendarItem(accessToken, kind, id);
      if (form.id === id) resetForm(kind);
      await loadItems();
      onChanged();
      setMessage("Calendar item removed.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove calendar item.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Edit calendar</Text>
      <View style={styles.segmentRow}>
        {(["event", "block"] as const).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => resetForm(kind)}
            style={[styles.segmentButton, form.kind === kind && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, form.kind === kind && styles.segmentTextActive]}>
              {kind === "event" ? "One-off Event" : "Weekly Block"}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        onChangeText={(title) => setForm((current) => ({ ...current, title }))}
        placeholder="Title"
        placeholderTextColor="#94a3b8"
        style={styles.input}
        value={form.title}
      />

      <View style={styles.wrapRow}>
        {categories.map((category) => (
          <Pressable
            key={category}
            onPress={() => setForm((current) => ({ ...current, category }))}
            style={[styles.choiceButton, form.category === category && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, form.category === category && styles.choiceTextActive]}>
              {titleCase(category)}
            </Text>
          </Pressable>
        ))}
      </View>

      {form.kind === "event" ? (
        <TextInput
          autoCapitalize="none"
          onChangeText={(date) => setForm((current) => ({ ...current, date }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={form.date}
        />
      ) : (
        <View style={styles.wrapRow}>
          {weekdays.map((day) => (
            <Pressable
              key={day.value}
              onPress={() => toggleWeekday(day.value)}
              style={[styles.dayButton, form.daysOfWeek.includes(day.value) && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, form.daysOfWeek.includes(day.value) && styles.choiceTextActive]}>
                {day.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.timeRow}>
        <TextInput
          autoCapitalize="none"
          onChangeText={(startTime) => setForm((current) => ({ ...current, startTime }))}
          placeholder="Start HH:MM"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.timeInput]}
          value={form.startTime}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={(endTime) => setForm((current) => ({ ...current, endTime }))}
          placeholder="End HH:MM"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.timeInput]}
          value={form.endTime}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.actionRow}>
        <Pressable disabled={saving} onPress={saveItem} style={[styles.primaryButton, saving && styles.disabled]}>
          <Text style={styles.primaryText}>{saving ? "Saving..." : form.id ? "Update Item" : "Add Item"}</Text>
        </Pressable>
        {form.id ? (
          <Pressable onPress={() => resetForm(form.kind)} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel Edit</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>Recurring blocks</Text>
        {loading ? <ActivityIndicator color="#0f766e" /> : null}
        {!loading && blocks.length === 0 ? <Text style={styles.empty}>No recurring blocks.</Text> : null}
        {blocks.map((block) => (
          <View key={block.id} style={styles.item}>
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{block.title}</Text>
              <Text style={styles.itemMeta}>
                {block.daysOfWeek.map((day) => weekdays.find((entry) => entry.value === day)?.label).join(", ")} | {block.startTime} - {block.endTime} | {titleCase(block.category)}
              </Text>
            </View>
            <View style={styles.itemActions}>
              <Pressable onPress={() => editBlock(block)} style={styles.smallButton}><Text style={styles.smallText}>Edit</Text></Pressable>
              <Pressable disabled={removingId === block.id} onPress={() => removeItem("block", block.id)} style={styles.removeButton}><Text style={styles.removeText}>{removingId === block.id ? "..." : "Remove"}</Text></Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>One-off events</Text>
        {!loading && events.length === 0 ? <Text style={styles.empty}>No one-off events.</Text> : null}
        {events.map((event) => (
          <View key={event.id} style={styles.item}>
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{event.title}</Text>
              <Text style={styles.itemMeta}>{event.date} | {event.startTime} - {event.endTime} | {titleCase(event.category)}</Text>
            </View>
            <View style={styles.itemActions}>
              <Pressable onPress={() => editEvent(event)} style={styles.smallButton}><Text style={styles.smallText}>Edit</Text></Pressable>
              <Pressable disabled={removingId === event.id} onPress={() => removeItem("event", event.id)} style={styles.removeButton}><Text style={styles.removeText}>{removingId === event.id ? "..." : "Remove"}</Text></Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#ffffff", borderColor: "#d8e1ea", borderRadius: 8, borderWidth: 1, gap: 12, padding: 16 },
  panelTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  segmentRow: { flexDirection: "row", gap: 8 },
  segmentButton: { alignItems: "center", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 8 },
  segmentActive: { backgroundColor: "#111827", borderColor: "#111827" },
  segmentText: { color: "#334155", fontSize: 13, fontWeight: "800", textAlign: "center" },
  segmentTextActive: { color: "#ffffff" },
  input: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, color: "#111827", fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceButton: { borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, minHeight: 38, justifyContent: "center", paddingHorizontal: 10 },
  dayButton: { alignItems: "center", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, height: 40, justifyContent: "center", width: 45 },
  choiceActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  choiceText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  choiceTextActive: { color: "#ffffff" },
  timeRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  timeInput: { flex: 1, minWidth: 130 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryButton: { alignItems: "center", backgroundColor: "#0f766e", borderRadius: 8, flex: 1, minHeight: 48, justifyContent: "center", minWidth: 140, paddingHorizontal: 14 },
  primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  cancelButton: { alignItems: "center", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 14 },
  cancelText: { color: "#334155", fontSize: 14, fontWeight: "800" },
  listSection: { borderTopColor: "#e2e8f0", borderTopWidth: 1, gap: 10, paddingTop: 14 },
  listTitle: { color: "#111827", fontSize: 16, fontWeight: "800" },
  item: { borderColor: "#e2e8f0", borderRadius: 8, borderWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", padding: 12 },
  itemCopy: { flex: 1, minWidth: 185 },
  itemTitle: { color: "#111827", fontSize: 15, fontWeight: "800" },
  itemMeta: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 4 },
  itemActions: { flexDirection: "row", gap: 7 },
  smallButton: { alignItems: "center", borderColor: "#0f766e", borderRadius: 8, borderWidth: 1, minHeight: 36, justifyContent: "center", paddingHorizontal: 10 },
  smallText: { color: "#0f766e", fontSize: 12, fontWeight: "800" },
  removeButton: { alignItems: "center", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, minHeight: 36, justifyContent: "center", paddingHorizontal: 10 },
  removeText: { color: "#b91c1c", fontSize: 12, fontWeight: "800" },
  empty: { color: "#64748b", fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.58 },
  error: { color: "#b91c1c", fontSize: 14, lineHeight: 20 },
  success: { color: "#047857", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
