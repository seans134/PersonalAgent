import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  createMobileMeal,
  createMobileSavedMeal,
  deleteMobileMeal,
  deleteMobileSavedMeal,
  fetchMobileMeals,
  fetchMobileSavedMeals,
  trackMobileSavedMeal,
  updateMobileMeal,
  updateMobileSavedMeal,
  type MobileMealInput,
  type MobileMealLog,
  type MobileSavedMeal,
} from "../lib/api";
import { successHaptic } from "../lib/haptics";

type MealsScreenProps = {
  accessToken: string;
};

type MealFormState = {
  name: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  fiberGrams: string;
  notes: string;
};

const emptyForm: MealFormState = {
  name: "",
  calories: "",
  proteinGrams: "",
  carbsGrams: "",
  fatGrams: "",
  fiberGrams: "",
  notes: "",
};

function numberOrNull(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function toInput(form: MealFormState): MobileMealInput {
  return {
    mealType: "meal",
    name: form.name,
    calories: numberOrNull(form.calories),
    proteinGrams: numberOrNull(form.proteinGrams),
    carbsGrams: numberOrNull(form.carbsGrams),
    fatGrams: numberOrNull(form.fatGrams),
    fiberGrams: numberOrNull(form.fiberGrams),
    notes: form.notes || null,
  };
}

function formFromMeal(meal: MobileMealLog | MobileSavedMeal): MealFormState {
  return {
    name: meal.name,
    calories: meal.calories === null ? "" : String(meal.calories),
    proteinGrams: meal.protein_grams === null ? "" : String(meal.protein_grams),
    carbsGrams: meal.carbs_grams === null ? "" : String(meal.carbs_grams),
    fatGrams: meal.fat_grams === null ? "" : String(meal.fat_grams),
    fiberGrams: meal.fiber_grams === null ? "" : String(meal.fiber_grams),
    notes: meal.notes ?? "",
  };
}

function formatNumber(value: number | null) {
  return value === null ? "-" : Number(value).toLocaleString();
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sum(meals: MobileMealLog[], key: "calories" | "protein_grams" | "carbs_grams" | "fat_grams" | "fiber_grams") {
  return meals.reduce((total, meal) => total + Number(meal[key] ?? 0), 0);
}

export function MealsScreen({ accessToken }: MealsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [meals, setMeals] = useState<MobileMealLog[]>([]);
  const [savedMeals, setSavedMeals] = useState<MobileSavedMeal[]>([]);
  const [form, setForm] = useState<MealFormState>(emptyForm);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editingSavedMealId, setEditingSavedMealId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const totals = useMemo(
    () => ({
      meals: meals.length,
      calories: sum(meals, "calories"),
      protein: sum(meals, "protein_grams"),
      carbs: sum(meals, "carbs_grams"),
      fat: sum(meals, "fat_grams"),
      fiber: sum(meals, "fiber_grams"),
    }),
    [meals],
  );

  const loadMeals = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);

    try {
      const [mealResult, savedResult] = await Promise.all([
        fetchMobileMeals(accessToken),
        fetchMobileSavedMeals(accessToken),
      ]);
      setMeals(mealResult.meals);
      setSavedMeals(savedResult.savedMeals);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load meals.");
    }

    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadMeals();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadMeals]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadMeals();
    setRefreshing(false);
  }

  function updateForm(key: keyof MealFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitMeal() {
    setSaving(true);
    setMessage(undefined);

    try {
      const input = toInput(form);

      if (editingMealId) {
        const result = await updateMobileMeal(accessToken, { ...input, id: editingMealId });
        setMeals((current) => current.map((meal) => (meal.id === editingMealId ? result.meal : meal)));
        setMessage("Meal updated.");
      } else {
        const result = await createMobileMeal(accessToken, input);
        setMeals((current) => [result.meal, ...current]);
        successHaptic();
        setMessage("Meal logged.");
      }

      setForm(emptyForm);
      setEditingMealId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save meal.");
    }

    setSaving(false);
  }

  async function removeMeal(id: string) {
    setPendingId(id);
    setMessage(undefined);

    try {
      await deleteMobileMeal(accessToken, id);
      setMeals((current) => current.filter((meal) => meal.id !== id));
      setMessage("Meal removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove meal.");
    }

    setPendingId(null);
  }

  async function saveMeal(meal: MobileMealLog) {
    setPendingId(meal.id);
    setMessage(undefined);

    try {
      const result = await createMobileSavedMeal(accessToken, {
        name: meal.name,
        calories: meal.calories,
        proteinGrams: meal.protein_grams,
        carbsGrams: meal.carbs_grams,
        fatGrams: meal.fat_grams,
        fiberGrams: meal.fiber_grams,
        notes: meal.notes,
      });
      setSavedMeals((current) => [result.savedMeal, ...current]);
      setMessage("Saved meal added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save meal.");
    }

    setPendingId(null);
  }

  async function trackSavedMeal(id: string) {
    setPendingId(id);
    setMessage(undefined);

    try {
      const result = await trackMobileSavedMeal(accessToken, id);
      setMeals((current) => [result.meal, ...current]);
      successHaptic();
      setMessage("Saved meal tracked for today.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to track saved meal.");
    }

    setPendingId(null);
  }

  async function removeSavedMeal(id: string) {
    setPendingId(id);
    setMessage(undefined);

    try {
      await deleteMobileSavedMeal(accessToken, id);
      setSavedMeals((current) => current.filter((meal) => meal.id !== id));
      setEditingSavedMealId(null);
      setMessage("Saved meal removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove saved meal.");
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
        <Text style={styles.eyebrow}>Tracking</Text>
        <Text style={styles.title}>Meals</Text>
        <Text style={styles.body}>Log meals, review today&apos;s totals, and track saved meals again.</Text>
      </View>

      <View style={styles.totalsGrid}>
        <Stat label="Meals" value={totals.meals} />
        <Stat label="Calories" value={totals.calories} />
        <Stat label="Protein g" value={totals.protein} />
        <Stat label="Carbs g" value={totals.carbs} />
        <Stat label="Fat g" value={totals.fat} />
        <Stat label="Fiber g" value={totals.fiber} />
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelLabel}>{editingMealId ? "Edit meal" : "Log a meal"}</Text>
            <Text style={styles.panelBody}>Track what you ate and any macros you know.</Text>
          </View>
          <Pressable disabled={loading} onPress={loadMeals} style={styles.smallButton}>
            {loading ? <ActivityIndicator color={theme.colors.teal} /> : <Text style={styles.smallButtonText}>Refresh</Text>}
          </Pressable>
        </View>

        <MealForm form={form} onChange={updateForm} />
        <View style={styles.actionRow}>
          <Pressable
            disabled={saving}
            onPress={submitMeal}
            style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.buttonPressed]}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text style={styles.primaryText}>{editingMealId ? "Save Meal" : "Log Meal"}</Text>
            )}
          </Pressable>
          {editingMealId ? (
            <Pressable
              onPress={() => {
                setEditingMealId(null);
                setForm(emptyForm);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Today&apos;s meals</Text>
        {meals.length === 0 ? (
          <Text style={styles.empty}>No meals logged today.</Text>
        ) : (
          <View style={styles.list}>
            {meals.map((meal) => (
              <View key={meal.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{meal.name}</Text>
                    <Text style={styles.itemMeta}>{formatTime(meal.logged_at)}</Text>
                  </View>
                  <Text style={styles.calories}>{formatNumber(meal.calories)} cal</Text>
                </View>
                <Text style={styles.itemMeta}>
                  Protein {formatNumber(meal.protein_grams)}g | Carbs {formatNumber(meal.carbs_grams)}g | Fat{" "}
                  {formatNumber(meal.fat_grams)}g | Fiber {formatNumber(meal.fiber_grams)}g
                </Text>
                {meal.notes ? <Text style={styles.itemNotes}>{meal.notes}</Text> : null}
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => {
                      setEditingMealId(meal.id);
                      setForm(formFromMeal(meal));
                    }}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>Edit</Text>
                  </Pressable>
                  <Pressable disabled={pendingId === meal.id} onPress={() => saveMeal(meal)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>Save Meal</Text>
                  </Pressable>
                  <Pressable disabled={pendingId === meal.id} onPress={() => removeMeal(meal.id)} style={styles.dangerButton}>
                    <Text style={styles.dangerText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Saved meals</Text>
        {savedMeals.length === 0 ? (
          <Text style={styles.empty}>No saved meals yet. Save one from today&apos;s meals first.</Text>
        ) : (
          <View style={styles.list}>
            {savedMeals.map((meal) => {
              const isEditing = editingSavedMealId === meal.id;

              return (
                <View key={meal.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{meal.name}</Text>
                  <Text style={styles.itemMeta}>
                    {formatNumber(meal.calories)} cal | P {formatNumber(meal.protein_grams)}g | C{" "}
                    {formatNumber(meal.carbs_grams)}g | F {formatNumber(meal.fat_grams)}g | Fiber{" "}
                    {formatNumber(meal.fiber_grams)}g
                  </Text>
                  {meal.notes ? <Text style={styles.itemNotes}>{meal.notes}</Text> : null}

                  {isEditing ? (
                    <SavedMealEditor
                      accessToken={accessToken}
                      meal={meal}
                      onCancel={() => setEditingSavedMealId(null)}
                      onRemove={() => removeSavedMeal(meal.id)}
                      onSaved={(nextMeal) => {
                        setSavedMeals((current) => current.map((item) => (item.id === nextMeal.id ? nextMeal : item)));
                        setEditingSavedMealId(null);
                        setMessage("Saved meal updated.");
                      }}
                    />
                  ) : (
                    <View style={styles.actionRow}>
                      <Pressable disabled={pendingId === meal.id} onPress={() => trackSavedMeal(meal.id)} style={styles.primarySmallButton}>
                        <Text style={styles.primarySmallText}>Track</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingSavedMealId(meal.id)} style={styles.secondaryButton}>
                        <Text style={styles.secondaryText}>Edit</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{Number(value).toLocaleString()}</Text>
    </View>
  );
}

function MealForm({
  form,
  onChange,
}: {
  form: MealFormState;
  onChange: (key: keyof MealFormState, value: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.form}>
      <Field label="Meal name" onChangeText={(value) => onChange("name", value)} placeholder="Chicken rice bowl" value={form.name} />
      <Field keyboardType="number-pad" label="Calories" onChangeText={(value) => onChange("calories", value)} value={form.calories} />
      <View style={styles.macroGrid}>
        <Field keyboardType="decimal-pad" label="Protein g" onChangeText={(value) => onChange("proteinGrams", value)} value={form.proteinGrams} />
        <Field keyboardType="decimal-pad" label="Carbs g" onChangeText={(value) => onChange("carbsGrams", value)} value={form.carbsGrams} />
        <Field keyboardType="decimal-pad" label="Fat g" onChangeText={(value) => onChange("fatGrams", value)} value={form.fatGrams} />
        <Field keyboardType="decimal-pad" label="Fiber g" onChangeText={(value) => onChange("fiberGrams", value)} value={form.fiberGrams} />
      </View>
      <Field multiline label="Notes" onChangeText={(value) => onChange("notes", value)} placeholder="Optional notes" value={form.notes} />
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
  keyboardType?: "default" | "number-pad" | "decimal-pad";
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

function SavedMealEditor({
  accessToken,
  meal,
  onCancel,
  onRemove,
  onSaved,
}: {
  accessToken: string;
  meal: MobileSavedMeal;
  onCancel: () => void;
  onRemove: () => void;
  onSaved: (meal: MobileSavedMeal) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [form, setForm] = useState<MealFormState>(formFromMeal(meal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save() {
    setSaving(true);
    setError(undefined);

    try {
      const result = await updateMobileSavedMeal(accessToken, { ...toInput(form), id: meal.id });
      onSaved(result.savedMeal);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update saved meal.");
    }

    setSaving(false);
  }

  return (
    <View style={styles.savedEditor}>
      <MealForm form={form} onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} />
      {error ? <Text style={styles.message}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable disabled={saving} onPress={save} style={styles.primarySmallButton}>
          {saving ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.primarySmallText}>Save</Text>}
        </Pressable>
        <Pressable onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={styles.dangerButton}>
          <Text style={styles.dangerText}>Remove</Text>
        </Pressable>
      </View>
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
  totalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: "30%",
    padding: 12,
  },
  statLabel: {
    ...theme.text("monoLabel", "inkMuted"),
  },
  statValue: {
    ...theme.text("title", "ink"),
    marginTop: 6,
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
  message: {
    ...theme.text("label", "teal"),
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
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
    minHeight: 82,
    textAlignVertical: "top",
  },
  macroGrid: {
    gap: 10,
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
    minWidth: 78,
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
  itemCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  itemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  itemMain: {
    flex: 1,
  },
  itemTitle: {
    ...theme.text("heading", "ink"),
  },
  itemMeta: {
    ...theme.text("body", "inkMuted"),
    marginTop: 5,
  },
  itemNotes: {
    ...theme.text("body", "inkMuted"),
    marginTop: 8,
  },
  calories: {
    ...theme.text("label", "ink"),
  },
  savedEditor: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
  },
});
}
