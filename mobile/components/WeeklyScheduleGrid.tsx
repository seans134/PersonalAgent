import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ScheduleBlockCategory } from "@personal-agent/core/calendar";
import {
  createMobileCalendarItem,
  deleteMobileCalendarItem,
  updateMobileCalendarItem,
  type MobileScheduleBlock,
} from "../lib/api";
import { eventColor, formatHour, toMinutes, toTimeString, weekdayLabels } from "../lib/calendar-view";
import { errorHaptic, successHaptic, tapHaptic } from "../lib/haptics";

type WeeklyScheduleGridProps = {
  accessToken: string;
  blocks: MobileScheduleBlock[];
  categories: ScheduleBlockCategory[];
  defaultCategory: ScheduleBlockCategory;
  onChanged: () => Promise<void> | void;
  visibleCategories: ScheduleBlockCategory[];
};

type BlockFormState = {
  id: string | null;
  title: string;
  category: ScheduleBlockCategory;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const hours = Array.from({ length: 24 }, (_, index) => index);
const hourColumnWidth = 62;
const dayColumnWidth = 104;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatCategory(category: ScheduleBlockCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function placeholderForCategory(category: ScheduleBlockCategory) {
  if (category === "school") return "Biology lecture";
  if (category === "work") return "Closing shift";
  if (category === "study") return "Exam review";
  if (category === "unavailable") return "Blocked time";
  return "Gym, dinner, family time";
}

function blockOverlapsHour(block: MobileScheduleBlock, hour: number) {
  const hourStart = hour * 60;
  return toMinutes(block.startTime) < hourStart + 60 && toMinutes(block.endTime) > hourStart;
}

function localTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

export function WeeklyScheduleGrid({
  accessToken,
  blocks,
  categories,
  defaultCategory,
  onChanged,
  visibleCategories,
}: WeeklyScheduleGridProps) {
  const [activeCategory, setActiveCategory] = useState<ScheduleBlockCategory>(defaultCategory);
  const [form, setForm] = useState<BlockFormState | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const visibleBlocks = blocks.filter((block) => visibleCategories.includes(block.category));

  function blocksAt(dayOfWeek: number, hour: number) {
    return visibleBlocks
      .filter((block) => block.daysOfWeek.includes(dayOfWeek) && blockOverlapsHour(block, hour))
      .sort((first, second) => first.startTime.localeCompare(second.startTime));
  }

  function openCreate(dayOfWeek: number, hour: number) {
    tapHaptic();
    setError("");
    setForm({
      id: null,
      title: "",
      category: activeCategory,
      daysOfWeek: [dayOfWeek],
      startTime: toTimeString(hour),
      endTime: hour === 23 ? "23:59" : toTimeString(hour + 1),
    });
  }

  function openEdit(block: MobileScheduleBlock) {
    // Blocks outside this step's editable categories are context only.
    if (!categories.includes(block.category)) return;

    tapHaptic();
    setError("");
    setForm({
      id: block.id,
      title: block.title,
      category: block.category,
      daysOfWeek: [...block.daysOfWeek],
      startTime: block.startTime,
      endTime: block.endTime,
    });
  }

  function closeModal() {
    setForm(null);
    setError("");
  }

  function updateForm(patch: Partial<BlockFormState>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }

  function toggleDay(day: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            daysOfWeek: current.daysOfWeek.includes(day)
              ? current.daysOfWeek.filter((value) => value !== day)
              : [...current.daysOfWeek, day].sort((first, second) => first - second),
          }
        : current,
    );
  }

  async function handleSave() {
    if (!form) return;

    if (!form.title.trim()) {
      setError("Add a name before saving.");
      errorHaptic();
      return;
    }
    if (form.daysOfWeek.length === 0) {
      setError("Choose at least one day.");
      errorHaptic();
      return;
    }
    if (!timePattern.test(form.startTime) || !timePattern.test(form.endTime)) {
      setError("Times must use HH:MM format.");
      errorHaptic();
      return;
    }
    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      errorHaptic();
      return;
    }

    setSaving(true);
    setError("");

    const input = {
      kind: "block" as const,
      title: form.title.trim(),
      category: form.category,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
      timezone: localTimezone(),
    };

    try {
      if (form.id) {
        await updateMobileCalendarItem(accessToken, { ...input, id: form.id });
      } else {
        await createMobileCalendarItem(accessToken, input);
      }
      successHaptic();
      closeModal();
      await onChanged();
    } catch (saveError) {
      errorHaptic();
      setError(saveError instanceof Error ? saveError.message : "Unable to save schedule block.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form?.id) return;

    setDeleting(true);
    setError("");

    try {
      await deleteMobileCalendarItem(accessToken, "block", form.id);
      successHaptic();
      closeModal();
      await onChanged();
    } catch (deleteError) {
      errorHaptic();
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove schedule block.");
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <View style={styles.wrapper}>
      <View style={styles.controlRow}>
        <View style={styles.segmentGroup}>
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => {
                tapHaptic();
                setActiveCategory(category);
              }}
              style={[styles.segmentButton, activeCategory === category && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeCategory === category && styles.segmentTextActive,
                ]}
              >
                {formatCategory(category)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.countRow}>
          {categories.map((category) => (
            <Text key={category} style={styles.countText}>
              {blocks.filter((block) => block.category === category).length} {category}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.hint}>
        Tap an empty slot to add a {formatCategory(activeCategory).toLowerCase()} block. Tap a block
        to edit it.
      </Text>

      <View style={styles.card}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.headerRow}>
              <View style={[styles.timeGutter, styles.headerCell]}>
                <Text style={styles.headerLabel}>Time</Text>
              </View>
              {weekdayLabels.map((label) => (
                <View key={label} style={[styles.dayColumn, styles.headerCell]}>
                  <Text style={styles.headerDay}>{label}</Text>
                </View>
              ))}
            </View>

            {hours.map((hour) => (
              <View key={hour} style={styles.hourRow}>
                <View style={[styles.timeGutter, styles.hourCell]}>
                  <Text style={styles.hourLabel}>{formatHour(hour)}</Text>
                </View>
                {weekdayLabels.map((label, dayOfWeek) => {
                  const cellBlocks = blocksAt(dayOfWeek, hour);

                  return (
                    <Pressable
                      key={`${label}-${hour}`}
                      onPress={() => openCreate(dayOfWeek, hour)}
                      style={({ pressed }) => [
                        styles.dayColumn,
                        styles.hourCell,
                        pressed && styles.pressed,
                      ]}
                    >
                      {cellBlocks.map((block) => {
                        const colors = eventColor(block.category);
                        const isEditable = categories.includes(block.category);

                        return (
                          <Pressable
                            key={`${block.id}-${hour}`}
                            onPress={() => openEdit(block)}
                            style={[
                              styles.pill,
                              { backgroundColor: colors.background, borderColor: colors.border },
                              !isEditable && styles.pillReadOnly,
                            ]}
                          >
                            <Text numberOfLines={1} style={[styles.pillText, { color: colors.text }]}>
                              {block.startTime} {block.title}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {form ? (
        <Modal animationType="slide" onRequestClose={closeModal} transparent visible>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.backdrop}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderText}>
                  <Text style={styles.eyebrow}>
                    {form.id ? "Edit" : "New"} {formatCategory(form.category).toLowerCase()} block
                  </Text>
                  <Text style={styles.sheetTitle}>
                    {form.startTime} - {form.endTime}
                  </Text>
                </View>
                <Pressable onPress={closeModal} style={styles.closeButton}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  autoFocus={!form.id}
                  onChangeText={(title) => updateForm({ title })}
                  placeholder={placeholderForCategory(form.category)}
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={form.title}
                />

                <Text style={styles.label}>Repeats weekly on</Text>
                <View style={styles.wrapRow}>
                  {weekdayLabels.map((label, day) => {
                    const isChecked = form.daysOfWeek.includes(day);

                    return (
                      <Pressable
                        key={label}
                        onPress={() => toggleDay(day)}
                        style={[styles.dayButton, isChecked && styles.dayButtonActive]}
                      >
                        <Text style={[styles.dayButtonText, isChecked && styles.dayButtonTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Type</Text>
                <View style={styles.wrapRow}>
                  {categories.map((category) => {
                    const isActive = form.category === category;
                    const colors = eventColor(category);

                    return (
                      <Pressable
                        key={category}
                        onPress={() => updateForm({ category })}
                        style={[
                          styles.choiceButton,
                          { borderColor: colors.border },
                          isActive && { backgroundColor: colors.background, borderColor: colors.text },
                        ]}
                      >
                        <View style={[styles.swatch, { backgroundColor: colors.text }]} />
                        <Text style={[styles.choiceText, isActive && { color: colors.text }]}>
                          {formatCategory(category)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.label}>Start</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(startTime) => updateForm({ startTime })}
                      placeholder="HH:MM"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      value={form.startTime}
                    />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.label}>End</Text>
                    <TextInput
                      autoCapitalize="none"
                      onChangeText={(endTime) => updateForm({ endTime })}
                      placeholder="HH:MM"
                      placeholderTextColor="#94a3b8"
                      style={styles.input}
                      value={form.endTime}
                    />
                  </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}
              </ScrollView>

              <View style={styles.actionRow}>
                {form.id ? (
                  <Pressable
                    disabled={busy}
                    onPress={handleDelete}
                    style={[styles.deleteButton, busy && styles.disabled]}
                  >
                    <Text style={styles.deleteText}>{deleting ? "Removing..." : "Remove"}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={busy}
                  onPress={handleSave}
                  style={[styles.primaryButton, busy && styles.disabled]}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryText}>{form.id ? "Save changes" : "Add block"}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
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
    minHeight: 42,
    paddingHorizontal: 13,
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
  countRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  countText: {
    color: "#64748b",
    fontSize: 13,
  },
  hint: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  headerRow: {
    backgroundColor: "#f8fafc",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  headerCell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
  },
  headerLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  headerDay: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  hourRow: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row",
  },
  hourCell: {
    minHeight: 44,
    padding: 3,
  },
  hourLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  timeGutter: {
    backgroundColor: "#f8fafc",
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 6,
    width: hourColumnWidth,
  },
  dayColumn: {
    borderRightColor: "#f1f5f9",
    borderRightWidth: 1,
    gap: 2,
    width: dayColumnWidth,
  },
  pill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  pillReadOnly: {
    opacity: 0.6,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.65,
  },
  backdrop: {
    backgroundColor: "rgba(9, 9, 11, 0.5)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    paddingBottom: 28,
  },
  sheetHeader: {
    alignItems: "flex-start",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 18,
  },
  sheetHeaderText: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sheetTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
  },
  closeButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 10,
  },
  closeText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
  sheetBody: {
    paddingHorizontal: 18,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 46,
  },
  dayButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  dayButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  dayButtonTextActive: {
    color: "#ffffff",
  },
  choiceButton: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  swatch: {
    borderRadius: 3,
    height: 10,
    width: 10,
  },
  choiceText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  timeRow: {
    flexDirection: "row",
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  actionRow: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  deleteButton: {
    alignItems: "center",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  deleteText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.58,
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
});
