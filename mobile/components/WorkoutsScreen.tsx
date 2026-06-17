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
  createMobileWorkout,
  deleteMobileWorkout,
  fetchMobileWorkouts,
  trackMobilePlannedWorkout,
  type MobilePlannedWorkout,
  type MobileWorkoutIntensity,
  type MobileWorkoutLog,
  type MobileWorkoutMetrics,
  type MobileWorkoutTrackingMethod,
  type MobileWorkoutType,
} from "../lib/api";

type WorkoutsScreenProps = {
  accessToken: string;
};

type WorkoutForm = {
  workoutType: MobileWorkoutType;
  trackingMethod: MobileWorkoutTrackingMethod;
  title: string;
  durationMinutes: string;
  intensity: MobileWorkoutIntensity;
  caloriesBurned: string;
  primaryMetric: string;
  secondaryMetric: string;
  notes: string;
};

const methodsByType: Record<MobileWorkoutType, MobileWorkoutTrackingMethod[]> = {
  strength: ["sets_reps_weight", "bodyweight_sets"],
  cardio: ["distance_time", "time_only", "intervals"],
  recovery: ["mobility_flow", "stretching", "breathwork"],
  sport: ["game", "practice", "skills"],
};

const workoutTypes: MobileWorkoutType[] = ["strength", "cardio", "recovery", "sport"];
const intensities: MobileWorkoutIntensity[] = ["light", "moderate", "intense"];

const initialForm: WorkoutForm = {
  workoutType: "strength",
  trackingMethod: "sets_reps_weight",
  title: "",
  durationMinutes: "",
  intensity: "moderate",
  caloriesBurned: "",
  primaryMetric: "",
  secondaryMetric: "",
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

function metricLabels(method: MobileWorkoutTrackingMethod) {
  if (method === "sets_reps_weight") return ["Sets x reps", "Weight"];
  if (method === "bodyweight_sets") return ["Sets x reps", "Variation"];
  if (method === "distance_time") return ["Distance", "Pace"];
  if (method === "intervals") return ["Intervals", "Rest"];
  if (method === "mobility_flow" || method === "stretching") return ["Focus area", "Rounds"];
  if (method === "breathwork") return ["Pattern", "Rounds"];
  if (method === "game") return ["Sport", "Result"];
  if (method === "practice") return ["Sport", "Drill"];
  if (method === "skills") return ["Skill", "Focus"];
  return ["Focus", "Details"];
}

function metricsFromForm(form: WorkoutForm): MobileWorkoutMetrics {
  const [primaryLabel, secondaryLabel] = metricLabels(form.trackingMethod);
  const metrics: MobileWorkoutMetrics = {};

  if (form.primaryMetric.trim()) {
    metrics[primaryLabel.toLowerCase().replace(/\s+/g, "_")] = form.primaryMetric.trim();
  }

  if (form.secondaryMetric.trim()) {
    metrics[secondaryLabel.toLowerCase().replace(/\s+/g, "_")] = form.secondaryMetric.trim();
  }

  return metrics;
}

function metricText(metrics: MobileWorkoutMetrics | null) {
  if (!metrics || Object.keys(metrics).length === 0) return null;

  return Object.entries(metrics)
    .map(([key, value]) => `${titleCase(key)}: ${value}`)
    .join(" - ");
}

function formatLoggedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function workoutSummary(workout: Pick<MobileWorkoutLog | MobilePlannedWorkout, "duration_minutes" | "metrics" | "notes">) {
  const parts = [
    workout.duration_minutes ? `${workout.duration_minutes} min` : null,
    metricText(workout.metrics),
    workout.notes,
  ].filter(Boolean);

  return parts.length ? parts.join(" - ") : "No extra details";
}

export function WorkoutsScreen({ accessToken }: WorkoutsScreenProps) {
  const [workouts, setWorkouts] = useState<MobileWorkoutLog[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<MobilePlannedWorkout[]>([]);
  const [form, setForm] = useState<WorkoutForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedScheduleIds = useMemo(
    () => new Set(workouts.map((workout) => workout.source_schedule_item_id).filter(Boolean)),
    [workouts],
  );

  const loadWorkouts = useCallback(async () => {
    try {
      setError(null);
      const response = await fetchMobileWorkouts(accessToken);
      setWorkouts(response.workouts);
      setPlannedWorkouts(response.plannedWorkouts);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load workouts.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  function updateType(workoutType: MobileWorkoutType) {
    setForm((current) => ({
      ...current,
      workoutType,
      trackingMethod: methodsByType[workoutType][0],
      primaryMetric: "",
      secondaryMetric: "",
    }));
  }

  async function submitWorkout() {
    if (!form.title.trim()) {
      setError("Add a workout title first.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await createMobileWorkout(accessToken, {
        workoutType: form.workoutType,
        trackingMethod: form.trackingMethod,
        title: form.title.trim(),
        durationMinutes: numberOrNull(form.durationMinutes),
        intensity: form.intensity,
        caloriesBurned: numberOrNull(form.caloriesBurned),
        metrics: metricsFromForm(form),
        notes: form.notes.trim() || null,
      });

      setWorkouts((current) => [response.workout, ...current]);
      setForm({
        ...initialForm,
        workoutType: form.workoutType,
        trackingMethod: form.trackingMethod,
        intensity: form.intensity,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to log workout.");
    } finally {
      setSaving(false);
    }
  }

  async function trackPlannedWorkout(scheduleItemId: string) {
    setTrackingId(scheduleItemId);
    setError(null);

    try {
      const response = await trackMobilePlannedWorkout(accessToken, scheduleItemId);
      setWorkouts((current) => {
        const withoutDuplicate = current.filter((workout) => workout.id !== response.workout.id);
        return [response.workout, ...withoutDuplicate];
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to track planned workout.");
    } finally {
      setTrackingId(null);
    }
  }

  async function removeWorkout(id: string) {
    setRemovingId(id);
    setError(null);

    try {
      await deleteMobileWorkout(accessToken, id);
      setWorkouts((current) => current.filter((workout) => workout.id !== id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to remove workout.");
    } finally {
      setRemovingId(null);
    }
  }

  const metricInputLabels = metricLabels(form.trackingMethod);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Fitness</Text>
          <Text style={styles.title}>Workouts</Text>
          <Text style={styles.subtitle}>{"Log training and mark today's planned sessions complete."}</Text>
        </View>
        <Pressable onPress={loadWorkouts} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Log a workout</Text>

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

        <View style={styles.fieldRow}>
          <TextInput
            keyboardType="number-pad"
            onChangeText={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
            placeholder="Minutes"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.fieldHalf]}
            value={form.durationMinutes}
          />
          <TextInput
            keyboardType="number-pad"
            onChangeText={(caloriesBurned) => setForm((current) => ({ ...current, caloriesBurned }))}
            placeholder="Calories"
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.fieldHalf]}
            value={form.caloriesBurned}
          />
        </View>

        <View style={styles.segmentRow}>
          {intensities.map((intensity) => (
            <Pressable
              key={intensity}
              onPress={() => setForm((current) => ({ ...current, intensity }))}
              style={[styles.segmentButton, form.intensity === intensity && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentText, form.intensity === intensity && styles.segmentTextActive]}>
                {titleCase(intensity)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.fieldRow}>
          <TextInput
            onChangeText={(primaryMetric) => setForm((current) => ({ ...current, primaryMetric }))}
            placeholder={metricInputLabels[0]}
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.fieldHalf]}
            value={form.primaryMetric}
          />
          <TextInput
            onChangeText={(secondaryMetric) => setForm((current) => ({ ...current, secondaryMetric }))}
            placeholder={metricInputLabels[1]}
            placeholderTextColor="#94a3b8"
            style={[styles.input, styles.fieldHalf]}
            value={form.secondaryMetric}
          />
        </View>

        <TextInput
          multiline
          onChangeText={(notes) => setForm((current) => ({ ...current, notes }))}
          placeholder="Notes"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.notesInput]}
          value={form.notes}
        />

        <Pressable disabled={saving} onPress={submitWorkout} style={[styles.primaryButton, saving && styles.disabled]}>
          <Text style={styles.primaryButtonText}>{saving ? "Logging..." : "Log Workout"}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{"Today's planned workouts"}</Text>
        {loading ? <ActivityIndicator color="#0f766e" /> : null}
        {!loading && plannedWorkouts.length === 0 ? (
          <Text style={styles.emptyText}>No planned workouts for today.</Text>
        ) : null}
        {plannedWorkouts.map((workout) => {
          const completed = completedScheduleIds.has(workout.id);
          return (
            <View key={workout.id} style={styles.item}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{workout.title}</Text>
                <Text style={styles.itemMeta}>
                  {titleCase(workout.workout_type)} - {titleCase(workout.tracking_method)}
                </Text>
                <Text style={styles.itemDetail}>{workoutSummary(workout)}</Text>
              </View>
              <Pressable
                disabled={completed || trackingId === workout.id}
                onPress={() => trackPlannedWorkout(workout.id)}
                style={[styles.smallButton, completed && styles.completeButton, trackingId === workout.id && styles.disabled]}
              >
                <Text style={[styles.smallButtonText, completed && styles.completeButtonText]}>
                  {completed ? "Done" : trackingId === workout.id ? "Tracking" : "Track"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{"Today's workouts"}</Text>
        {!loading && workouts.length === 0 ? <Text style={styles.emptyText}>No workouts logged yet.</Text> : null}
        {workouts.map((workout) => (
          <View key={workout.id} style={styles.item}>
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{workout.title}</Text>
              <Text style={styles.itemMeta}>
                {formatLoggedAt(workout.logged_at)} - {titleCase(workout.workout_type)} - {titleCase(workout.intensity)}
              </Text>
              <Text style={styles.itemDetail}>{workoutSummary(workout)}</Text>
            </View>
            <Pressable
              disabled={removingId === workout.id}
              onPress={() => removeWorkout(workout.id)}
              style={[styles.smallButton, styles.removeButton, removingId === workout.id && styles.disabled]}
            >
              <Text style={styles.removeButtonText}>{removingId === workout.id ? "..." : "Remove"}</Text>
            </Pressable>
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
  notesInput: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 130,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  itemMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 2,
  },
  itemDetail: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  smallButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#0f766e",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallButtonText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
  },
  completeButton: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  completeButtonText: {
    color: "#047857",
  },
  removeButton: {
    borderColor: "#fecaca",
  },
  removeButtonText: {
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
});
