import { useCallback, useEffect, useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { successHaptic } from "../lib/haptics";
import {
  createMobileGoal,
  deleteMobileGoal,
  fetchMobileGoals,
  setMobileGoalCompleted,
  updateMobileGoal,
  type MobileGoal,
  type MobileGoalInput,
} from "../lib/api";

type GoalsScreenProps = {
  accessToken: string;
};

type GoalFormState = {
  title: string;
  description: string;
  priority: string;
  taskType: MobileGoalInput["taskType"];
  minimumDailyMinutes: string;
  endDate: string;
};

const emptyForm: GoalFormState = {
  title: "",
  description: "",
  priority: "1",
  taskType: "general",
  minimumDailyMinutes: "0",
  endDate: "",
};

const taskTypes: MobileGoalInput["taskType"][] = ["general", "focus", "fitness", "wellness", "admin"];

function inputFromForm(form: GoalFormState): MobileGoalInput {
  const priority = Number(form.priority);
  const minimumDailyMinutes = Number(form.minimumDailyMinutes);

  return {
    title: form.title,
    description: form.description || null,
    priority: priority === 2 || priority === 3 ? priority : 1,
    taskType: form.taskType,
    minimumDailyMinutes: Number.isFinite(minimumDailyMinutes) ? minimumDailyMinutes : 0,
    endDate: form.endDate || null,
  };
}

function formFromGoal(goal: MobileGoal): GoalFormState {
  return {
    title: goal.title,
    description: goal.description ?? "",
    priority: String(goal.priority || 3),
    taskType: taskTypes.includes(goal.task_type as MobileGoalInput["taskType"])
      ? (goal.task_type as MobileGoalInput["taskType"])
      : "general",
    minimumDailyMinutes: String(goal.minimum_daily_minutes ?? 0),
    endDate: goal.end_date ?? "",
  };
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return "No end date";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

export function GoalsScreen({ accessToken }: GoalsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [activeGoals, setActiveGoals] = useState<MobileGoal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<MobileGoal[]>([]);
  const [form, setForm] = useState<GoalFormState>(emptyForm);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);

    try {
      const result = await fetchMobileGoals(accessToken);
      setActiveGoals(result.activeGoals);
      setCompletedGoals(result.completedGoals);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load goals.");
    }

    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadGoals();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadGoals]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadGoals();
    setRefreshing(false);
  }

  function updateForm(key: keyof GoalFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function upsertGoal(goal: MobileGoal) {
    if (goal.completed_at) {
      setActiveGoals((current) => current.filter((item) => item.id !== goal.id));
      setCompletedGoals((current) => [goal, ...current.filter((item) => item.id !== goal.id)]);
      return;
    }

    setCompletedGoals((current) => current.filter((item) => item.id !== goal.id));
    setActiveGoals((current) => {
      const exists = current.some((item) => item.id === goal.id);
      const next = exists ? current.map((item) => (item.id === goal.id ? goal : item)) : [...current, goal];
      return next.sort((first, second) => first.priority - second.priority);
    });
  }

  async function submitGoal() {
    setSaving(true);
    setMessage(undefined);

    try {
      const input = inputFromForm(form);
      const result = editingGoalId
        ? await updateMobileGoal(accessToken, { ...input, id: editingGoalId })
        : await createMobileGoal(accessToken, input);

      upsertGoal(result.goal);
      setForm(emptyForm);
      setEditingGoalId(null);
      setMessage(editingGoalId ? "Goal updated." : "Goal added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save goal.");
    }

    setSaving(false);
  }

  async function toggleComplete(goal: MobileGoal, completed: boolean) {
    setPendingId(goal.id);
    setMessage(undefined);

    try {
      const result = await setMobileGoalCompleted(accessToken, goal.id, completed);
      upsertGoal(result.goal);
      if (completed) successHaptic();
      setMessage(completed ? "Goal completed." : "Goal restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update goal.");
    }

    setPendingId(null);
  }

  async function removeGoal(goal: MobileGoal) {
    setPendingId(goal.id);
    setMessage(undefined);

    try {
      await deleteMobileGoal(accessToken, goal.id);
      setActiveGoals((current) => current.filter((item) => item.id !== goal.id));
      setCompletedGoals((current) => current.filter((item) => item.id !== goal.id));
      setMessage("Goal removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove goal.");
    }

    setPendingId(null);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.teal} colors={[theme.colors.teal]} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Goals</Text>
        <Text style={styles.title}>Outcomes for Atlas to plan around.</Text>
        <Text style={styles.body}>These goals feed today planning, meals, and workouts.</Text>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelLabel}>{editingGoalId ? "Edit goal" : "Add goal"}</Text>
            <Text style={styles.panelBody}>Create a goal with a clear title and daily planning hint.</Text>
          </View>
          <Pressable disabled={loading} onPress={loadGoals} style={styles.smallButton}>
            {loading ? <ActivityIndicator color={theme.colors.teal} /> : <Text style={styles.smallButtonText}>Refresh</Text>}
          </Pressable>
        </View>

        <GoalForm form={form} onChange={updateForm} />
        <View style={styles.actionRow}>
          <Pressable
            disabled={saving}
            onPress={submitGoal}
            style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.buttonPressed]}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text style={styles.primaryText}>{editingGoalId ? "Save Goal" : "Add Goal"}</Text>
            )}
          </Pressable>
          {editingGoalId ? (
            <Pressable
              onPress={() => {
                setEditingGoalId(null);
                setForm(emptyForm);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <GoalSection
        emptyText="No active goals saved yet."
        goals={activeGoals}
        isCompletedSection={false}
        onEdit={(goal) => {
          setEditingGoalId(goal.id);
          setForm(formFromGoal(goal));
        }}
        onRemove={removeGoal}
        onToggleComplete={toggleComplete}
        pendingId={pendingId}
        title="Active goals"
      />

      <GoalSection
        emptyText="No completed goals yet."
        goals={completedGoals}
        isCompletedSection
        onEdit={(goal) => {
          setEditingGoalId(goal.id);
          setForm(formFromGoal(goal));
        }}
        onRemove={removeGoal}
        onToggleComplete={toggleComplete}
        pendingId={pendingId}
        title="Completed goals"
      />
    </ScrollView>
  );
}

function GoalForm({
  form,
  onChange,
}: {
  form: GoalFormState;
  onChange: (key: keyof GoalFormState, value: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.form}>
      <Field label="Goal title" onChangeText={(value) => onChange("title", value)} placeholder="Run a half marathon" value={form.title} />
      <Field multiline label="Description" onChangeText={(value) => onChange("description", value)} placeholder="Why this matters or what success looks like" value={form.description} />
      <Field keyboardType="number-pad" label="Priority 1-3" onChangeText={(value) => onChange("priority", value)} value={form.priority} />
      <Field keyboardType="number-pad" label="Minimum daily minutes" onChangeText={(value) => onChange("minimumDailyMinutes", value)} value={form.minimumDailyMinutes} />
      <Field label="End date YYYY-MM-DD" onChangeText={(value) => onChange("endDate", value)} placeholder="2026-09-30" value={form.endDate} />
      <View style={styles.taskTypeRow}>
        {taskTypes.map((taskType) => (
          <Pressable
            key={taskType}
            onPress={() => onChange("taskType", taskType)}
            style={[styles.taskTypeOption, form.taskType === taskType && styles.taskTypeOptionActive]}
          >
            <Text style={[styles.taskTypeText, form.taskType === taskType && styles.taskTypeTextActive]}>
              {taskType}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Field({
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "default" | "number-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkMuted}
        style={[styles.input, multiline && styles.textArea]}
        value={value}
      />
    </View>
  );
}

function GoalSection({
  emptyText,
  goals,
  isCompletedSection,
  onEdit,
  onRemove,
  onToggleComplete,
  pendingId,
  title,
}: {
  emptyText: string;
  goals: MobileGoal[];
  isCompletedSection: boolean;
  onEdit: (goal: MobileGoal) => void;
  onRemove: (goal: MobileGoal) => void;
  onToggleComplete: (goal: MobileGoal, completed: boolean) => void;
  pendingId: string | null;
  title: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{title}</Text>
      {goals.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {goals.map((goal) => (
            <View key={goal.id} style={styles.goalCard}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              {goal.description ? <Text style={styles.goalDescription}>{goal.description}</Text> : null}
              <Text style={styles.goalMeta}>
                Priority {goal.priority} | {goal.task_type ?? "general"} | {goal.minimum_daily_minutes ?? 0} min/day
              </Text>
              <Text style={styles.goalMeta}>
                {goal.completed_at ? `Completed ${formatDateOnly(goal.completed_at.slice(0, 10))}` : formatDateOnly(goal.end_date)}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  disabled={pendingId === goal.id}
                  onPress={() => onToggleComplete(goal, !isCompletedSection)}
                  style={isCompletedSection ? styles.secondaryButton : styles.primarySmallButton}
                >
                  <Text style={isCompletedSection ? styles.secondaryText : styles.primarySmallText}>
                    {isCompletedSection ? "Restore" : "Complete"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onEdit(goal)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Edit</Text>
                </Pressable>
                <Pressable disabled={pendingId === goal.id} onPress={() => onRemove(goal)} style={styles.dangerButton}>
                  <Text style={styles.dangerText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  content: {
    gap: 18,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    ...theme.text("monoLabel", "teal"),
  },
  title: {
    ...theme.text("displayXl", "ink"),
  },
  body: {
    ...theme.text("bodyLg", "inkMuted"),
  },
  message: {
    ...theme.text("label", "teal"),
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  panelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  panelHeaderCopy: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 180,
  },
  panelLabel: {
    ...theme.text("title", "ink"),
  },
  panelBody: {
    ...theme.text("body", "inkMuted"),
    marginBottom: 16,
    marginTop: 8,
  },
  form: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    ...theme.text("label", "ink"),
  },
  input: {
    ...theme.text("bodyLg", "ink"),
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  taskTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  taskTypeOption: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  taskTypeOptionActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  taskTypeText: {
    ...theme.text("label", "ink"),
  },
  taskTypeTextActive: {
    color: colors.surface,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 128,
    paddingHorizontal: 14,
  },
  primaryText: {
    ...theme.text("heading", "surface"),
  },
  primarySmallButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 94,
    paddingHorizontal: 12,
  },
  primarySmallText: {
    ...theme.text("label", "surface"),
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.teal,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  secondaryText: {
    ...theme.text("label", "teal"),
  },
  dangerButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  dangerText: {
    ...theme.text("label", "danger"),
  },
  smallButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.teal,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  smallButtonText: {
    ...theme.text("label", "teal"),
  },
  buttonPressed: {
    opacity: 0.78,
  },
  empty: {
    ...theme.text("body", "inkMuted"),
    marginTop: 12,
  },
  list: {
    gap: 12,
    marginTop: 14,
  },
  goalCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  goalTitle: {
    ...theme.text("heading", "ink"),
  },
  goalDescription: {
    ...theme.text("body", "inkMuted"),
    marginTop: 6,
  },
  goalMeta: {
    ...theme.text("body", "inkMuted"),
    marginTop: 5,
  },
});
}
