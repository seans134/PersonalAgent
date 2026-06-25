import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  applyMobileWorkoutPlan,
  createMobileWorkoutPlanItem,
  deleteMobileWorkoutPlanItem,
  fetchMobileWorkoutPlan,
  parseMobileWorkoutPlan,
  type MobileWorkoutMetrics,
  type MobileWorkoutScheduleDraft,
  type MobileWorkoutScheduleDraftItem,
  type MobileWorkoutScheduleItem,
  type MobileWorkoutTrackingMethod,
  type MobileWorkoutType,
} from "../lib/api";

type WorkoutPlanScreenProps = {
  accessToken: string;
};

type PlanForm = {
  dayOfWeek: number;
  workoutType: MobileWorkoutType;
  trackingMethod: MobileWorkoutTrackingMethod;
  title: string;
  durationMinutes: string;
  sets: string;
  reps: string;
  weight: string;
  notes: string;
};

const days = [
  { value: 1, label: "Mon", fullLabel: "Monday" },
  { value: 2, label: "Tue", fullLabel: "Tuesday" },
  { value: 3, label: "Wed", fullLabel: "Wednesday" },
  { value: 4, label: "Thu", fullLabel: "Thursday" },
  { value: 5, label: "Fri", fullLabel: "Friday" },
  { value: 6, label: "Sat", fullLabel: "Saturday" },
  { value: 7, label: "Sun", fullLabel: "Sunday" },
];

const methodsByType: Record<MobileWorkoutType, MobileWorkoutTrackingMethod[]> = {
  strength: ["sets_reps_weight", "bodyweight_sets"],
  cardio: ["distance_time", "time_only", "intervals"],
  recovery: ["mobility_flow", "stretching", "breathwork"],
  sport: ["game", "practice", "skills"],
};

const workoutTypes: MobileWorkoutType[] = ["strength", "cardio", "recovery", "sport"];

const initialForm: PlanForm = {
  dayOfWeek: 1,
  workoutType: "strength",
  trackingMethod: "sets_reps_weight",
  title: "",
  durationMinutes: "",
  sets: "",
  reps: "",
  weight: "",
  notes: "",
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function scheduleMetrics(form: PlanForm): MobileWorkoutMetrics {
  if (form.trackingMethod === "sets_reps_weight") {
    return {
      sets: numberOrNull(form.sets),
      reps: numberOrNull(form.reps),
      weight: numberOrNull(form.weight),
      weight_unit: "lb",
    };
  }

  if (form.trackingMethod === "bodyweight_sets") {
    return {
      sets: numberOrNull(form.sets),
      reps: numberOrNull(form.reps),
    };
  }

  return {};
}

function metricText(item: MobileWorkoutScheduleItem) {
  const metrics = item.metrics ?? {};

  if (item.tracking_method === "sets_reps_weight") {
    const parts = [
      metrics.sets ? `${metrics.sets} sets` : null,
      metrics.reps ? `${metrics.reps} reps` : null,
      metrics.weight !== null && metrics.weight !== undefined ? `${metrics.weight} ${metrics.weight_unit ?? "lb"}` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(" - ") : null;
  }

  if (item.tracking_method === "bodyweight_sets") {
    const parts = [
      metrics.sets ? `${metrics.sets} sets` : null,
      metrics.reps ? `${metrics.reps} reps` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(" - ") : null;
  }

  return item.duration_minutes ? `${item.duration_minutes} min` : null;
}

function itemSummary(item: MobileWorkoutScheduleItem) {
  const parts = [
    titleCase(item.workout_type),
    titleCase(item.tracking_method),
    metricText(item),
    item.notes,
  ].filter(Boolean);

  return parts.join(" - ");
}

function draftItemSummary(item: MobileWorkoutScheduleDraftItem) {
  const metrics = Object.entries(item.metrics ?? {}).flatMap(([key, value]) =>
    value === null || value === "" ? [] : [`${titleCase(key)}: ${value}`],
  );
  const parts = [
    titleCase(item.workout_type),
    titleCase(item.tracking_method),
    item.duration_minutes ? `${item.duration_minutes} min` : null,
    ...metrics,
    item.notes,
  ].filter(Boolean);

  return parts.join(" - ");
}

export function WorkoutPlanScreen({ accessToken }: WorkoutPlanScreenProps) {
  const [items, setItems] = useState<MobileWorkoutScheduleItem[]>([]);
  const [form, setForm] = useState<PlanForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [planText, setPlanText] = useState("");
  const [draft, setDraft] = useState<MobileWorkoutScheduleDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupedItems = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        items: items.filter((item) => item.day_of_week === day.value),
      })),
    [items],
  );

  const loadPlan = useCallback(async () => {
    try {
      setError(null);
      const response = await fetchMobileWorkoutPlan(accessToken);
      setItems(response.scheduleItems);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load workout plan.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  function updateType(workoutType: MobileWorkoutType) {
    setForm((current) => ({
      ...current,
      workoutType,
      trackingMethod: methodsByType[workoutType][0],
      sets: "",
      reps: "",
      weight: "",
      durationMinutes: "",
    }));
  }

  async function addItem() {
    if (!form.title.trim()) {
      setError("Add a workout title first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await createMobileWorkoutPlanItem(accessToken, {
        dayOfWeek: form.dayOfWeek,
        workoutType: form.workoutType,
        trackingMethod: form.trackingMethod,
        title: form.title.trim(),
        durationMinutes: numberOrNull(form.durationMinutes),
        metrics: scheduleMetrics(form),
        notes: form.notes.trim() || null,
      });

      setItems((current) =>
        [...current, response.scheduleItem].sort(
          (left, right) => left.day_of_week - right.day_of_week || left.position - right.position,
        ),
      );
      setForm({
        ...initialForm,
        dayOfWeek: form.dayOfWeek,
        workoutType: form.workoutType,
        trackingMethod: form.trackingMethod,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to add planned workout.");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    setRemovingId(id);
    setError(null);

    try {
      await deleteMobileWorkoutPlanItem(accessToken, id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove planned workout.");
    } finally {
      setRemovingId(null);
    }
  }

  async function parsePlan() {
    if (planText.trim().length < 8) {
      setError("Add a little more workout plan detail before parsing.");
      return;
    }

    setParsing(true);
    setDraft(null);
    setMessage(null);
    setError(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      const response = await parseMobileWorkoutPlan(accessToken, planText.trim(), timezone);
      setDraft(response.draft);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to parse workout plan.");
    } finally {
      setParsing(false);
    }
  }

  async function applyPlan() {
    if (!draft || draft.items.length === 0) return;

    setApplying(true);
    setMessage(null);
    setError(null);

    try {
      const response = await applyMobileWorkoutPlan(accessToken, draft);
      setMessage(`Added ${response.applied.scheduleItemsCreated} planned workouts.`);
      setPlanText("");
      setDraft(null);
      await loadPlan();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save workout plan.");
    } finally {
      setApplying(false);
    }
  }

  const usesStrengthMetrics = form.trackingMethod === "sets_reps_weight" || form.trackingMethod === "bodyweight_sets";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Weekly rhythm</Text>
          <Text style={styles.title}>Workout Plan</Text>
          <Text style={styles.subtitle}>Build the planned workouts that appear on your daily workout screen.</Text>
        </View>
        <Pressable onPress={loadPlan} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Plan from text</Text>
        <Text style={styles.helperText}>Describe your weekly workouts, then review them before saving.</Text>
        <TextInput
          multiline
          onChangeText={setPlanText}
          placeholder="Monday upper body 3x10, Wednesday 30 minute run, Friday basketball practice."
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.planTextInput]}
          value={planText}
        />
        <Pressable
          disabled={parsing || planText.trim().length < 8}
          onPress={parsePlan}
          style={[styles.primaryButton, (parsing || planText.trim().length < 8) && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>{parsing ? "Parsing..." : "Review Workout Plan"}</Text>
        </Pressable>

        {draft ? (
          <View style={styles.draftSection}>
            <Text style={styles.draftTitle}>Review parsed workouts</Text>
            {draft.items.length === 0 ? <Text style={styles.emptyText}>No planned workouts found.</Text> : null}
            {draft.items.map((item, index) => (
              <View key={`${item.day_of_week}-${item.title}-${index}`} style={styles.draftItem}>
                <Text style={styles.draftDay}>{days.find((day) => day.value === item.day_of_week)?.fullLabel}</Text>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDetail}>{draftItemSummary(item)}</Text>
              </View>
            ))}

            {draft.warnings.length > 0 ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>Review notes</Text>
                {draft.warnings.map((warning, index) => (
                  <Text key={`${warning}-${index}`} style={styles.warningText}>- {warning}</Text>
                ))}
              </View>
            ) : null}

            <Pressable
              disabled={applying || draft.items.length === 0}
              onPress={applyPlan}
              style={[styles.secondaryActionButton, (applying || draft.items.length === 0) && styles.disabled]}
            >
              <Text style={styles.secondaryActionText}>{applying ? "Saving..." : "Add Planned Workouts"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Add planned workout</Text>

        <View style={styles.segmentRow}>
          {days.map((day) => (
            <Pressable
              key={day.value}
              onPress={() => setForm((current) => ({ ...current, dayOfWeek: day.value }))}
              style={[styles.dayButton, form.dayOfWeek === day.value && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentText, form.dayOfWeek === day.value && styles.segmentTextActive]}>
                {day.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.segmentRow}>
          {workoutTypes.map((type) => (
            <Pressable
              key={type}
              onPress={() => updateType(type)}
              style={[styles.segmentButton, form.workoutType === type && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentText, form.workoutType === type && styles.segmentTextActive]}>
                {titleCase(type)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.segmentRow}>
          {methodsByType[form.workoutType].map((method) => (
            <Pressable
              key={method}
              onPress={() => setForm((current) => ({ ...current, trackingMethod: method }))}
              style={[styles.methodButton, form.trackingMethod === method && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentText, form.trackingMethod === method && styles.segmentTextActive]}>
                {titleCase(method)}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          onChangeText={(title) => setForm((current) => ({ ...current, title }))}
          placeholder="Workout title"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={form.title}
        />

        {usesStrengthMetrics ? (
          <View style={styles.fieldRow}>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(sets) => setForm((current) => ({ ...current, sets }))}
              placeholder="Sets"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.thirdField]}
              value={form.sets}
            />
            <TextInput
              keyboardType="number-pad"
              onChangeText={(reps) => setForm((current) => ({ ...current, reps }))}
              placeholder="Reps"
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.thirdField]}
              value={form.reps}
            />
            {form.trackingMethod === "sets_reps_weight" ? (
              <TextInput
                keyboardType="decimal-pad"
                onChangeText={(weight) => setForm((current) => ({ ...current, weight }))}
                placeholder="Weight"
                placeholderTextColor="#94a3b8"
                style={[styles.input, styles.thirdField]}
                value={form.weight}
              />
            ) : null}
          </View>
        ) : (
          <TextInput
            keyboardType="number-pad"
            onChangeText={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
            placeholder="Minutes"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={form.durationMinutes}
          />
        )}

        <TextInput
          onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
          placeholder="Notes"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={form.notes}
        />

        <Pressable disabled={saving} onPress={addItem} style={[styles.primaryButton, saving && styles.disabled]}>
          <Text style={styles.primaryButtonText}>{saving ? "Adding..." : "Add to Plan"}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Weekly schedule</Text>
        {loading ? <ActivityIndicator color="#0f766e" /> : null}
        {groupedItems.map((day) => (
          <View key={day.value} style={styles.daySection}>
            <Text style={styles.dayTitle}>{day.fullLabel}</Text>
            {day.items.length === 0 ? <Text style={styles.emptyText}>No workouts planned.</Text> : null}
            {day.items.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDetail}>{itemSummary(item)}</Text>
                </View>
                <Pressable
                  disabled={removingId === item.id}
                  onPress={() => removeItem(item.id)}
                  style={[styles.smallButton, removingId === item.id && styles.disabled]}
                >
                  <Text style={styles.smallButtonText}>{removingId === item.id ? "..." : "Remove"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 32,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  headerCopy: {
    flex: 1,
    minWidth: 210,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
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
  planTextInput: {
    minHeight: 108,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  helperText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  thirdField: {
    flex: 1,
    minWidth: 92,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    width: 47,
  },
  segmentButton: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  methodButton: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  segmentButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  segmentText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryActionButton: {
    alignItems: "center",
    borderColor: "#0f766e",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryActionText: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "800",
  },
  daySection: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 14,
  },
  draftSection: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 14,
  },
  draftTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  draftItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    gap: 3,
    padding: 12,
  },
  draftDay: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  warningBox: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  warningTitle: {
    color: "#92400e",
    fontSize: 14,
    fontWeight: "800",
  },
  warningText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 19,
  },
  dayTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  item: {
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    padding: 12,
  },
  itemCopy: {
    flex: 1,
    minWidth: 190,
  },
  itemTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  itemDetail: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  smallButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallButtonText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.58,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#b91c1c",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12,
  },
  success: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 8,
    borderWidth: 1,
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12,
  },
});
