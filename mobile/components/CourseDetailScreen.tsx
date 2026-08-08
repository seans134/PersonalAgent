import { useCallback, useEffect, useMemo, useState } from "react";
import { fontFamily, useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BulletBar } from "./BulletBar";
import { CourseItemModal } from "./CourseItemModal";
import { Icon } from "./Icon";
import {
  deleteMobileCategory,
  deleteMobileItem,
  fetchMobileCourseDetail,
  saveMobileCategory,
  saveMobileItem,
  setMobileItemGrade,
  type MobileCourseCategoryInput,
  type MobileCourseDetail,
  type MobileCourseItemInput,
} from "../lib/api";

type CourseDetailScreenProps = {
  accessToken: string;
  courseId: string;
  onBack: () => void;
};

type CourseItemRow = MobileCourseDetail["items"][number];
type CourseCategoryRow = MobileCourseDetail["categories"][number];

const KIND_LABEL: Record<CourseItemRow["kind"], string> = {
  assignment: "Assignment",
  quiz: "Quiz",
  exam: "Exam",
};

const FOCUS_MODE_LABEL: Record<CourseItemRow["focus_mode"], string> = {
  finish_first: "Finish first",
  continuous: "Ongoing",
  deferred: "Do later",
};

/** RN port of src/components/grade-format.ts (see CoursesScreen.tsx). */
function formatGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type ItemModalState = { open: boolean; initial: CourseItemRow | null };

const closedItemModal: ItemModalState = { open: false, initial: null };

export function CourseDetailScreen({ accessToken, courseId, onBack }: CourseDetailScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [detail, setDetail] = useState<MobileCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [itemModal, setItemModal] = useState<ItemModalState>(closedItemModal);

  const loadDetail = useCallback(async () => {
    setError(undefined);

    try {
      const result = await fetchMobileCourseDetail(accessToken, courseId);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load course.");
    }

    setLoading(false);
  }, [accessToken, courseId]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      void loadDetail();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadDetail]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  }

  async function handleSaveCategory(input: MobileCourseCategoryInput) {
    await saveMobileCategory(accessToken, courseId, input);
    await loadDetail();
  }

  function handleDeleteCategory(category: CourseCategoryRow) {
    Alert.alert(
      "Remove category?",
      `"${category.name}" will be removed. Its items keep their grades but lose the category link.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteMobileCategory(accessToken, courseId, category.id);
                await loadDetail();
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Unable to remove category.");
              }
            })();
          },
        },
      ],
    );
  }

  async function handleItemSubmit(input: MobileCourseItemInput) {
    const payload = itemModal.initial ? { ...input, itemId: itemModal.initial.id } : input;
    await saveMobileItem(accessToken, courseId, payload);
    setItemModal(closedItemModal);
    await loadDetail();
  }

  async function handleGrade(item: CourseItemRow, scoreEarned: number | null) {
    try {
      await setMobileItemGrade(accessToken, courseId, item.id, scoreEarned);
      await loadDetail();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save grade.");
    }
  }

  function handleDeleteItem(item: CourseItemRow) {
    Alert.alert("Remove item?", `"${item.title}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteMobileItem(accessToken, courseId, item.id);
              await loadDetail();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Unable to remove item.");
            }
          })();
        },
      },
    ]);
  }

  const itemGroups = useMemo(() => {
    if (!detail) return [];

    const itemsByCategory = new Map<string, CourseItemRow[]>();
    for (const item of detail.items) {
      const key = item.category_id ?? "uncategorized";
      const list = itemsByCategory.get(key) ?? [];
      list.push(item);
      itemsByCategory.set(key, list);
    }

    const groups = [
      ...detail.categories.map((category) => ({
        key: category.id,
        name: category.name,
        items: itemsByCategory.get(category.id) ?? [],
      })),
      { key: "uncategorized", name: "Uncategorized", items: itemsByCategory.get("uncategorized") ?? [] },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [detail]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to courses"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.backButton}
        >
          <Icon color={theme.colors.teal} name="back" size={20} strokeWidth={2.2} />
          <Text style={styles.backText}>Courses</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {detail ? detail.course.name : "Course"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[theme.colors.teal]}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            tintColor={theme.colors.teal}
          />
        }
      >
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {loading && !detail ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.teal} />
            <Text style={styles.body}>Loading course...</Text>
          </View>
        ) : error && !detail ? (
          <View style={styles.panel}>
            <Text style={styles.body}>{error}</Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setLoading(true);
                void loadDetail();
              }}
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : detail ? (
          <>
            <GradeSummarySection course={detail.course} grade={detail.grade} />
            <CategoriesSection
              categories={detail.categories}
              onDelete={handleDeleteCategory}
              onSave={handleSaveCategory}
            />
            <ItemsSection
              groups={itemGroups}
              onAdd={() => setItemModal({ open: true, initial: null })}
              onDeleteItem={handleDeleteItem}
              onEditItem={(item) => setItemModal({ open: true, initial: item })}
              onGrade={handleGrade}
            />
          </>
        ) : null}
      </ScrollView>

      <CourseItemModal
        categories={detail?.categories ?? []}
        initial={itemModal.initial}
        onClose={() => setItemModal(closedItemModal)}
        onSubmit={handleItemSubmit}
        visible={itemModal.open}
      />
    </View>
  );
}

function GradeSummarySection({
  course,
  grade,
}: {
  course: MobileCourseDetail["course"];
  grade: MobileCourseDetail["grade"];
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const averageLabel = formatGrade(grade.average);
  const targetLabel = course.target_grade !== null ? formatGrade(course.target_grade) : null;
  const weightSum = grade.categories.reduce((sum, category) => sum + Number(category.weight), 0);

  return (
    <View style={styles.panel}>
      <View style={styles.heroRow}>
        <Text style={styles.heroAverage}>{averageLabel}</Text>
        {targetLabel ? <Text style={styles.heroTarget}>Target {targetLabel}</Text> : null}
      </View>
      <View style={styles.heroBulletBar}>
        <BulletBar target={course.target_grade} value={grade.average} />
      </View>
      <Text style={styles.courseCaption}>Based on {grade.gradedWeight}% of your final grade</Text>

      {grade.warnings.includes("weights_sum_not_100") ? (
        <View style={styles.warningRow}>
          <Text style={styles.warningText}>Category weights sum to {weightSum}%, not 100%.</Text>
        </View>
      ) : null}

      {grade.categories.length > 0 ? (
        <View style={styles.categoryScoreList}>
          {grade.categories.map((category) => {
            const scoreLabel = formatGrade(category.score);
            return (
              <View key={category.id} style={styles.categoryScoreRow}>
                <View style={styles.categoryScoreHeader}>
                  <Text style={styles.categoryScoreName}>
                    {category.name} <Text style={styles.categoryScoreWeight}>{category.weight}%</Text>
                  </Text>
                  <Text style={styles.categoryScoreValue}>{scoreLabel}</Text>
                </View>
                <BulletBar value={category.score} />
                <Text style={styles.courseCaption}>
                  {category.gradedCount} of {category.itemCount} graded
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.body}>No categories yet.</Text>
      )}
    </View>
  );
}

type CategoryFormState = { name: string; weight: string };
const emptyCategoryForm: CategoryFormState = { name: "", weight: "" };

function CategoriesSection({
  categories,
  onSave,
  onDelete,
}: {
  categories: CourseCategoryRow[];
  onSave: (input: MobileCourseCategoryInput) => Promise<void>;
  onDelete: (category: CourseCategoryRow) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submitNewCategory() {
    setSaving(true);
    setError(undefined);

    try {
      const weight = Number(form.weight);
      await onSave({
        name: form.name.trim(),
        weight: form.weight.trim() && Number.isFinite(weight) ? weight : 0,
      });
      setForm(emptyCategoryForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save category.");
    }

    setSaving(false);
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelLabel}>Categories</Text>
        {!showForm ? (
          <Pressable hitSlop={8} onPress={() => setShowForm(true)} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Add category</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {categories.length > 0 ? (
        <View style={styles.categoryList}>
          {categories.map((category) => (
            <CategoryRow category={category} key={category.id} onDelete={() => onDelete(category)} onSave={onSave} />
          ))}
        </View>
      ) : (
        <Text style={styles.body}>No categories yet. Add one to start weighting grades.</Text>
      )}

      {showForm ? (
        <View style={styles.form}>
          <Field
            label="Name"
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
            placeholder="Ex: Homework"
            value={form.name}
          />
          <Field
            keyboardType="number-pad"
            label="Weight %"
            onChangeText={(weight) => setForm((f) => ({ ...f, weight }))}
            placeholder="20"
            value={form.weight}
          />
          <View style={styles.actionRow}>
            <Pressable
              disabled={saving || !form.name.trim()}
              onPress={submitNewCategory}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || saving || !form.name.trim()) && styles.buttonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.surface} />
              ) : (
                <Text style={styles.primaryText}>Add category</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setShowForm(false);
                setForm(emptyCategoryForm);
                setError(undefined);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: CourseCategoryRow;
  onSave: (input: MobileCourseCategoryInput) => Promise<void>;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [weight, setWeight] = useState(String(category.weight));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    setSaving(true);
    setError(undefined);

    try {
      const weightValue = Number(weight);
      await onSave({
        categoryId: category.id,
        name: name.trim(),
        weight: Number.isFinite(weightValue) ? weightValue : category.weight,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save category.");
    }

    setSaving(false);
  }

  if (editing) {
    return (
      <View style={styles.categoryEditRow}>
        <Field label="Name" onChangeText={setName} value={name} />
        <Field keyboardType="number-pad" label="Weight %" onChangeText={setWeight} value={weight} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.actionRow}>
          <Pressable
            disabled={saving || !name.trim()}
            onPress={submit}
            style={({ pressed }) => [styles.smallButton, (pressed || saving) && styles.buttonPressed]}
          >
            {saving ? <ActivityIndicator color={theme.colors.teal} /> : <Text style={styles.smallButtonText}>Save</Text>}
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setEditing(false);
              setName(category.name);
              setWeight(String(category.weight));
              setError(undefined);
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryRowText}>
        <Text style={styles.categoryRowName}>{category.name}</Text>
        <Text style={styles.categoryRowWeight}>{category.weight}%</Text>
      </View>
      <View style={styles.categoryRowActions}>
        <Pressable hitSlop={8} onPress={() => setEditing(true)} style={styles.iconButton}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={onDelete} style={styles.iconButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ItemsSection({
  groups,
  onAdd,
  onEditItem,
  onDeleteItem,
  onGrade,
}: {
  groups: Array<{ key: string; name: string; items: CourseItemRow[] }>;
  onAdd: () => void;
  onEditItem: (item: CourseItemRow) => void;
  onDeleteItem: (item: CourseItemRow) => void;
  onGrade: (item: CourseItemRow, scoreEarned: number | null) => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelLabel}>Items</Text>
        <Pressable accessibilityLabel="Add item" hitSlop={8} onPress={onAdd} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>+ Add item</Text>
        </Pressable>
      </View>

      {groups.length > 0 ? (
        <View style={styles.itemGroups}>
          {groups.map((group) => (
            <View key={group.key} style={styles.itemGroup}>
              <Text style={styles.itemGroupLabel}>{group.name}</Text>
              <View style={styles.itemList}>
                {group.items.map((item) => (
                  <ItemCard
                    item={item}
                    key={item.id}
                    onDelete={() => onDeleteItem(item)}
                    onEdit={() => onEditItem(item)}
                    onGrade={onGrade}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>No items yet. Add an assignment, quiz, or exam above.</Text>
      )}
    </View>
  );
}

function ItemCard({
  item,
  onEdit,
  onDelete,
  onGrade,
}: {
  item: CourseItemRow;
  onEdit: () => void;
  onDelete: () => void;
  onGrade: (item: CourseItemRow, scoreEarned: number | null) => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [gradeText, setGradeText] = useState(item.score_earned !== null ? String(item.score_earned) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGradeText(item.score_earned !== null ? String(item.score_earned) : "");
  }, [item.score_earned]);

  const timeLabel =
    item.kind === "assignment"
      ? `Due ${formatDueDate(item.due_at)}`
      : [formatScheduledTime(item.due_at), item.location].filter(Boolean).join(" · ");

  async function submitGrade() {
    const trimmed = gradeText.trim();
    const value = trimmed ? Number(trimmed) : null;
    if (trimmed && !Number.isFinite(value)) return;
    if (value === item.score_earned) return;

    setSaving(true);
    await onGrade(item, value);
    setSaving(false);
  }

  return (
    <View style={styles.itemCard}>
      <Pressable accessibilityRole="button" hitSlop={4} onPress={onEdit} style={styles.itemCardMain}>
        <View style={styles.itemTopRow}>
          <View style={styles.kindBadge}>
            <Text style={styles.kindBadgeText}>{KIND_LABEL[item.kind]}</Text>
          </View>
          <View style={styles.focusPill}>
            <Text style={styles.focusPillText}>{FOCUS_MODE_LABEL[item.focus_mode]}</Text>
          </View>
        </View>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemTime}>{timeLabel}</Text>
      </Pressable>

      <View style={styles.itemFooter}>
        <View style={styles.gradeRow}>
          <TextInput
            accessibilityLabel={`Grade earned for ${item.title}`}
            keyboardType="decimal-pad"
            onBlur={() => void submitGrade()}
            onChangeText={setGradeText}
            onSubmitEditing={() => void submitGrade()}
            placeholder="—"
            placeholderTextColor={theme.colors.inkMuted}
            returnKeyType="done"
            style={styles.gradeInput}
            value={gradeText}
          />
          <Text style={styles.gradeMax}>/ {item.score_max}</Text>
          {saving ? <ActivityIndicator color={theme.colors.teal} size="small" /> : null}
        </View>
        <Pressable accessibilityLabel={`Delete ${item.title}`} hitSlop={8} onPress={onDelete} style={styles.itemDeleteButton}>
          <Text style={styles.itemDeleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "default" | "number-pad";
  label: string;
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
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    header: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      paddingRight: 8,
      paddingVertical: 8,
    },
    backText: {
      ...theme.text("heading", "teal"),
    },
    headerTitle: {
      ...theme.text("title", "ink"),
      flexShrink: 1,
    },
    content: {
      gap: 18,
      padding: 24,
      paddingBottom: 40,
    },
    message: {
      ...theme.text("label", "teal"),
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    loadingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 8,
    },
    body: {
      ...theme.text("body", "inkMuted"),
    },
    errorText: {
      ...theme.text("label", "danger"),
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    panelHeader: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
    },
    panelLabel: {
      ...theme.text("title", "ink"),
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
    // Grade summary
    heroRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    heroAverage: {
      color: colors.ink,
      fontFamily: fontFamily.monoBold,
      fontSize: 40,
    },
    heroTarget: {
      ...theme.text("monoTime", "inkMuted"),
    },
    heroBulletBar: {
      marginTop: 4,
    },
    courseCaption: {
      ...theme.text("label", "inkMuted"),
    },
    warningRow: {
      backgroundColor: colors.surface2,
      borderColor: colors.warning,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    warningText: {
      ...theme.text("label", "warning"),
    },
    categoryScoreList: {
      gap: 14,
    },
    categoryScoreRow: {
      gap: 6,
    },
    categoryScoreHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    categoryScoreName: {
      ...theme.text("body", "ink"),
    },
    categoryScoreWeight: {
      ...theme.text("label", "inkMuted"),
    },
    categoryScoreValue: {
      ...theme.text("monoTime", "ink"),
    },
    // Categories management
    categoryList: {
      gap: 10,
    },
    categoryRow: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "space-between",
      padding: 12,
    },
    categoryRowText: {
      flexDirection: "row",
      gap: 8,
    },
    categoryRowName: {
      ...theme.text("body", "ink"),
    },
    categoryRowWeight: {
      ...theme.text("monoTime", "inkMuted"),
    },
    categoryRowActions: {
      flexDirection: "row",
      gap: 16,
    },
    iconButton: {
      minHeight: 32,
      justifyContent: "center",
    },
    editText: {
      ...theme.text("label", "teal"),
    },
    deleteText: {
      ...theme.text("label", "danger"),
    },
    categoryEditRow: {
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 12,
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
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 128,
      paddingHorizontal: 14,
    },
    primaryText: {
      ...theme.text("heading", "surface"),
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    secondaryText: {
      ...theme.text("label", "inkMuted"),
    },
    buttonPressed: {
      opacity: 0.78,
    },
    // Items
    itemGroups: {
      gap: 16,
    },
    itemGroup: {
      gap: 8,
    },
    itemGroupLabel: {
      ...theme.text("monoLabel", "inkMuted"),
    },
    itemList: {
      gap: 10,
    },
    itemCard: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      overflow: "hidden",
    },
    itemCardMain: {
      gap: 6,
      padding: 12,
    },
    itemTopRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    kindBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    kindBadgeText: {
      ...theme.text("label", "inkMuted"),
    },
    focusPill: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    focusPillText: {
      ...theme.text("label", "inkMuted"),
    },
    itemTitle: {
      ...theme.text("heading", "ink"),
    },
    itemTime: {
      ...theme.text("monoTime", "inkMuted"),
    },
    itemFooter: {
      alignItems: "center",
      borderTopColor: colors.line,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    gradeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    gradeInput: {
      ...theme.text("monoTime", "ink"),
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 6,
      borderWidth: 1,
      minHeight: 34,
      minWidth: 56,
      paddingHorizontal: 8,
      textAlign: "center",
    },
    gradeMax: {
      ...theme.text("monoTime", "inkMuted"),
    },
    itemDeleteButton: {
      minHeight: 32,
      justifyContent: "center",
    },
    itemDeleteText: {
      ...theme.text("label", "danger"),
    },
  });
}
