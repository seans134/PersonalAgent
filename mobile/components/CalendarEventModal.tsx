import { useMemo } from "react";
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
              placeholderTextColor={theme.colors.inkMuted}
              style={styles.input}
              value={form.title}
            />

            <Text style={styles.label}>Date</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={(date) => onChange({ date })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.inkMuted}
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
                  placeholderTextColor={theme.colors.inkMuted}
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
                  placeholderTextColor={theme.colors.inkMuted}
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
                <ActivityIndicator color={theme.colors.surface} />
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
    ...theme.text("label", "ink"),
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
  deleteButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  deleteText: {
    ...theme.text("body", "danger"),
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
