import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
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
import type { MobileCourseDetail, MobileCourseItemInput } from "../lib/api";

type CourseItem = MobileCourseDetail["items"][number];
type CourseCategory = MobileCourseDetail["categories"][number];

type CourseItemModalProps = {
  visible: boolean;
  initial: CourseItem | null;
  categories: CourseCategory[];
  /** Persists the item (create or update); throwing surfaces an inline error and keeps the sheet open. */
  onSubmit: (input: MobileCourseItemInput) => Promise<void> | void;
  onClose: () => void;
};

const KIND_OPTIONS: Array<{ value: CourseItem["kind"]; label: string }> = [
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "exam", label: "Exam" },
];

const FOCUS_MODE_OPTIONS: Array<{ value: CourseItem["focus_mode"]; label: string }> = [
  { value: "finish_first", label: "Finish first" },
  { value: "continuous", label: "Ongoing" },
  { value: "deferred", label: "Do later" },
];

type ItemFormState = {
  kind: CourseItem["kind"];
  title: string;
  categoryId: string;
  dueDate: string;
  dueTime: string;
  endTime: string;
  location: string;
  scoreMax: string;
  estimatedEffortHours: string;
  focusMode: CourseItem["focus_mode"];
};

const emptyForm: ItemFormState = {
  kind: "assignment",
  title: "",
  categoryId: "",
  dueDate: "",
  dueTime: "",
  endTime: "",
  location: "",
  scoreMax: "100",
  estimatedEffortHours: "",
  focusMode: "continuous",
};

/**
 * Mirrors item-row.tsx's local-time display: splits a stored ISO string into
 * the separate date/time text fields this modal uses (see CalendarEventModal,
 * whose date-picker approach — plain "YYYY-MM-DD" + "HH:MM" text inputs — we
 * reuse here instead of adding a new date-picker dependency).
 */
function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Combines the local date/time text fields back into an ISO string, treating
 * them as device-local wall-clock time (matching item-form.tsx's local-time
 * round-trip fix rather than parsing as UTC).
 */
function combineToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formFromInitial(initial: CourseItem | null): ItemFormState {
  if (!initial) return emptyForm;
  const due = splitIso(initial.due_at);
  const end = splitIso(initial.end_at);
  return {
    kind: initial.kind,
    title: initial.title,
    categoryId: initial.category_id ?? "",
    dueDate: due.date,
    dueTime: due.time,
    endTime: end.time,
    location: initial.location ?? "",
    scoreMax: String(initial.score_max ?? 100),
    estimatedEffortHours:
      initial.estimated_effort_hours !== null ? String(initial.estimated_effort_hours) : "",
    focusMode: initial.focus_mode,
  };
}

export function CourseItemModal({ visible, initial, categories, onSubmit, onClose }: CourseItemModalProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isEditing = initial !== null;
  const [form, setForm] = useState<ItemFormState>(() => formFromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset the form whenever the sheet is (re)opened, for either add or edit mode.
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets the form when the sheet (re)opens
      setForm(formFromInitial(initial));
      setError("");
      setSaving(false);
    }
  }, [visible, initial]);

  function updateForm(patch: Partial<ItemFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  const showScheduledFields = form.kind === "quiz" || form.kind === "exam";

  async function handleSubmit() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    const dueAt = combineToIso(form.dueDate, form.dueTime);
    if (!dueAt) {
      setError("Enter a valid date and time.");
      return;
    }

    const endAt = showScheduledFields ? combineToIso(form.dueDate, form.endTime) : null;
    const scoreMaxValue = Number(form.scoreMax);
    const effortValue = Number(form.estimatedEffortHours);

    const input: MobileCourseItemInput = {
      kind: form.kind,
      title: form.title.trim(),
      categoryId: form.categoryId ? form.categoryId : null,
      dueAt,
      endAt: showScheduledFields ? endAt : null,
      location: showScheduledFields && form.location.trim() ? form.location.trim() : null,
      scoreMax: form.scoreMax.trim() && Number.isFinite(scoreMaxValue) ? scoreMaxValue : 100,
      estimatedEffortHours:
        form.estimatedEffortHours.trim() && Number.isFinite(effortValue) ? effortValue : null,
      focusMode: form.focusMode,
    };

    setSaving(true);
    setError("");

    try {
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save item.");
    }

    setSaving(false);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.eyebrow}>{isEditing ? "Edit item" : "New item"}</Text>
              <Text style={styles.sheetTitle}>{form.title || "Untitled"}</Text>
            </View>
            <Pressable hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
            <Text style={styles.label}>Kind</Text>
            <View style={styles.wrapRow}>
              {KIND_OPTIONS.map((option) => {
                const isActive = form.kind === option.value;
                return (
                  <Pressable
                    hitSlop={4}
                    key={option.value}
                    onPress={() => updateForm({ kind: option.value })}
                    style={[styles.choiceButton, isActive && styles.choiceButtonActive]}
                  >
                    <Text style={[styles.choiceText, isActive && styles.choiceTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Title</Text>
            <TextInput
              onChangeText={(title) => updateForm({ title })}
              placeholder="Ex: Problem set 3"
              placeholderTextColor={theme.colors.inkMuted}
              style={styles.input}
              value={form.title}
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.wrapRow}>
              <Pressable
                hitSlop={4}
                onPress={() => updateForm({ categoryId: "" })}
                style={[styles.choiceButton, form.categoryId === "" && styles.choiceButtonActive]}
              >
                <Text style={[styles.choiceText, form.categoryId === "" && styles.choiceTextActive]}>None</Text>
              </Pressable>
              {categories.map((category) => {
                const isActive = form.categoryId === category.id;
                return (
                  <Pressable
                    hitSlop={4}
                    key={category.id}
                    onPress={() => updateForm({ categoryId: category.id })}
                    style={[styles.choiceButton, isActive && styles.choiceButtonActive]}
                  >
                    <Text style={[styles.choiceText, isActive && styles.choiceTextActive]}>{category.name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>{showScheduledFields ? "Scheduled" : "Due"}</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.subLabel}>Date</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(dueDate) => updateForm({ dueDate })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.dueDate}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.subLabel}>Time</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(dueTime) => updateForm({ dueTime })}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.dueTime}
                />
              </View>
            </View>

            {showScheduledFields ? (
              <>
                <Text style={styles.label}>End time</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(endTime) => updateForm({ endTime })}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.endTime}
                />

                <Text style={styles.label}>Location</Text>
                <TextInput
                  onChangeText={(location) => updateForm({ location })}
                  placeholder="Ex: Room 204"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.location}
                />
              </>
            ) : null}

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.label}>Score max</Text>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(scoreMax) => updateForm({ scoreMax })}
                  placeholder="100"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.scoreMax}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.label}>Est. effort (hrs)</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(estimatedEffortHours) => updateForm({ estimatedEffortHours })}
                  placeholder="Optional"
                  placeholderTextColor={theme.colors.inkMuted}
                  style={styles.input}
                  value={form.estimatedEffortHours}
                />
              </View>
            </View>

            <Text style={styles.label}>Scheduling mode</Text>
            <View style={styles.segmentRow}>
              {FOCUS_MODE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => updateForm({ focusMode: option.value })}
                  style={[styles.segmentButton, form.focusMode === option.value && styles.segmentActive]}
                >
                  <Text
                    style={[styles.segmentText, form.focusMode === option.value && styles.segmentTextActive]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actionRow}>
            <Pressable
              disabled={saving}
              onPress={handleSubmit}
              style={[styles.primaryButton, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.surface} />
              ) : (
                <Text style={styles.primaryText}>{isEditing ? "Save changes" : "Add item"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    backdrop: {
      backgroundColor: "rgba(9, 9, 11, 0.5)",
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: "88%",
      paddingBottom: 28,
    },
    sheetHeader: {
      alignItems: "flex-start",
      borderBottomColor: colors.line,
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
      ...theme.text("monoLabel", "teal"),
    },
    sheetTitle: {
      ...theme.text("title", "ink"),
    },
    closeButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 10,
    },
    closeText: {
      ...theme.text("label", "inkMuted"),
    },
    sheetBody: {
      paddingHorizontal: 18,
    },
    label: {
      ...theme.text("label", "ink"),
      marginBottom: 6,
      marginTop: 14,
    },
    subLabel: {
      ...theme.text("label", "inkMuted"),
      marginBottom: 6,
    },
    input: {
      ...theme.text("body", "ink"),
      backgroundColor: colors.paper,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    timeRow: {
      flexDirection: "row",
      gap: 10,
    },
    timeField: {
      flex: 1,
    },
    wrapRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    choiceButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    choiceButtonActive: {
      backgroundColor: colors.compassSoft,
      borderColor: colors.teal,
    },
    choiceText: {
      ...theme.text("label", "ink"),
    },
    choiceTextActive: {
      color: colors.teal,
    },
    segmentRow: {
      flexDirection: "row",
      gap: 8,
    },
    segmentButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 8,
    },
    segmentActive: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    segmentText: {
      ...theme.text("label", "ink"),
      textAlign: "center",
    },
    segmentTextActive: {
      color: colors.surface,
    },
    actionRow: {
      borderTopColor: colors.line,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
    },
    primaryText: {
      ...theme.text("body", "surface"),
    },
    disabled: {
      opacity: 0.58,
    },
    error: {
      ...theme.text("body", "danger"),
      marginTop: 14,
    },
  });
}
