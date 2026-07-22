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
import { categoryOptions, eventColor } from "../lib/calendar-view";

export type EventFormState = {
  title: string;
  category: ScheduleBlockCategory;
  date: string;
  startTime: string;
  endTime: string;
  recurrence: "single" | "weekly";
};

type CalendarEventModalProps = {
  deleting: boolean;
  error: string;
  form: EventFormState;
  isEditing: boolean;
  onChange: (patch: Partial<EventFormState>) => void;
  onClose: () => void;
  onDelete: () => void;
  onSubmit: () => void;
  saving: boolean;
  weekdayLabel: string;
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CalendarEventModal({
  deleting,
  error,
  form,
  isEditing,
  onChange,
  onClose,
  onDelete,
  onSubmit,
  saving,
  weekdayLabel,
}: CalendarEventModalProps) {
  const busy = saving || deleting;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={styles.eyebrow}>{isEditing ? "Edit event" : "New event"}</Text>
              <Text style={styles.sheetTitle}>{form.date}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              autoFocus={!isEditing}
              onChangeText={(title) => onChange({ title })}
              placeholder="Event title"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={form.title}
            />

            <Text style={styles.label}>Date</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={(date) => onChange({ date })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={form.date}
            />

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.label}>Start</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(startTime) => onChange({ startTime })}
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
                  onChangeText={(endTime) => onChange({ endTime })}
                  placeholder="HH:MM"
                  placeholderTextColor="#94a3b8"
                  style={styles.input}
                  value={form.endTime}
                />
              </View>
            </View>

            <Text style={styles.label}>Category</Text>
            <View style={styles.wrapRow}>
              {categoryOptions.map((category) => {
                const isActive = form.category === category;
                const colors = eventColor(category);

                return (
                  <Pressable
                    key={category}
                    onPress={() => onChange({ category })}
                    style={[
                      styles.choiceButton,
                      { borderColor: colors.border },
                      isActive && { backgroundColor: colors.background, borderColor: colors.text },
                    ]}
                  >
                    <View style={[styles.swatch, { backgroundColor: colors.text }]} />
                    <Text style={[styles.choiceText, isActive && { color: colors.text }]}>
                      {titleCase(category)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Repeat</Text>
            <View style={styles.segmentRow}>
              {(["single", "weekly"] as const).map((recurrence) => (
                <Pressable
                  key={recurrence}
                  onPress={() => onChange({ recurrence })}
                  style={[styles.segmentButton, form.recurrence === recurrence && styles.segmentActive]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      form.recurrence === recurrence && styles.segmentTextActive,
                    ]}
                  >
                    {recurrence === "single" ? "Single event" : `Weekly on ${weekdayLabel}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actionRow}>
            {isEditing ? (
              <Pressable
                disabled={busy}
                onPress={onDelete}
                style={[styles.deleteButton, busy && styles.disabled]}
              >
                <Text style={styles.deleteText}>{deleting ? "Deleting..." : "Delete"}</Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={busy}
              onPress={onSubmit}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>{isEditing ? "Save changes" : "Add event"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  segmentText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  segmentTextActive: {
    color: "#ffffff",
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
