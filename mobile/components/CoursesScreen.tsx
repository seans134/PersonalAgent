import { useCallback, useEffect, useMemo, useState } from "react";
import { fontFamily, useTheme } from "../lib/theme";
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
import { BulletBar } from "./BulletBar";
import {
  createMobileCourse,
  fetchMobileCourses,
  type MobileCourseInput,
  type MobileCourseSummary,
} from "../lib/api";

type CoursesScreenProps = {
  accessToken: string;
  onOpenCourse: (id: string) => void;
};

type CourseFormState = {
  name: string;
  code: string;
  term: string;
  targetGrade: string;
};

const emptyForm: CourseFormState = {
  name: "",
  code: "",
  term: "",
  targetGrade: "",
};

/** RN port of src/components/grade-format.ts. */
function formatGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function inputFromForm(form: CourseFormState): MobileCourseInput {
  const targetGrade = Number(form.targetGrade);
  return {
    name: form.name,
    code: form.code.trim() ? form.code.trim() : null,
    term: form.term.trim() ? form.term.trim() : null,
    targetGrade: form.targetGrade.trim() && Number.isFinite(targetGrade) ? targetGrade : null,
  };
}

export function CoursesScreen({ accessToken, onOpenCourse }: CoursesScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [courses, setCourses] = useState<MobileCourseSummary[]>([]);
  const [form, setForm] = useState<CourseFormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await fetchMobileCourses(accessToken);
      setCourses(result.courses);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to load courses.", tone: "error" });
    }

    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCourses();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCourses]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadCourses();
    setRefreshing(false);
  }

  function updateForm(key: keyof CourseFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
  }

  async function submitCourse() {
    setSaving(true);
    setMessage(null);

    try {
      await createMobileCourse(accessToken, inputFromForm(form));
      setForm(emptyForm);
      setShowForm(false);
      setMessage({ text: "Course added.", tone: "info" });
      await loadCourses();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to save course.", tone: "error" });
    }

    setSaving(false);
  }

  // The single nearest upcoming item across every course gets the warm
  // "now" accent; every other next-item chip stays neutral.
  const nearestCourseId = useMemo(() => {
    let id: string | null = null;
    let earliestDueAt = "";

    for (const course of courses) {
      if (!course.nextItem) continue;
      if (id === null || course.nextItem.dueAt < earliestDueAt) {
        id = course.id;
        earliestDueAt = course.nextItem.dueAt;
      }
    }

    return id;
  }, [courses]);

  return (
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
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Courses</Text>
        <Text style={styles.title}>Track grades and deadlines.</Text>
        <Text style={styles.body}>See how you&apos;re tracking toward your target grade in every course.</Text>
      </View>

      {message ? (
        <Text style={[styles.message, message.tone === "error" && styles.messageError]}>{message.text}</Text>
      ) : null}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelLabel}>Add course</Text>
            <Text style={styles.panelBody}>Create a course to start tracking grades and deadlines.</Text>
          </View>
          {!showForm ? (
            <Pressable hitSlop={8} onPress={() => setShowForm(true)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Add course</Text>
            </Pressable>
          ) : null}
        </View>

        {showForm ? (
          <>
            <CourseForm form={form} onChange={updateForm} />
            <View style={styles.actionRow}>
              <Pressable
                disabled={saving || !form.name.trim()}
                onPress={submitCourse}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || saving || !form.name.trim()) && styles.buttonPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.surface} />
                ) : (
                  <Text style={styles.primaryText}>Add Course</Text>
                )}
              </Pressable>
              <Pressable onPress={closeForm} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {loading && courses.length === 0 ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.colors.teal} />
          <Text style={styles.body}>Loading courses...</Text>
        </View>
      ) : courses.length === 0 ? (
        <Text style={styles.empty}>No courses yet. Add one above to get started.</Text>
      ) : (
        <View style={styles.list}>
          {courses.map((course) => (
            <CourseCard
              course={course}
              isNextUp={course.id === nearestCourseId}
              key={course.id}
              onPress={() => onOpenCourse(course.id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function CourseForm({
  form,
  onChange,
}: {
  form: CourseFormState;
  onChange: (key: keyof CourseFormState, value: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.form}>
      <Field label="Name" onChangeText={(value) => onChange("name", value)} placeholder="Organic Chemistry" value={form.name} />
      <Field label="Code" onChangeText={(value) => onChange("code", value)} placeholder="CHEM 201" value={form.code} />
      <Field label="Term" onChangeText={(value) => onChange("term", value)} placeholder="Fall 2026" value={form.term} />
      <Field
        keyboardType="number-pad"
        label="Target grade"
        onChangeText={(value) => onChange("targetGrade", value)}
        placeholder="90"
        value={form.targetGrade}
      />
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

function CourseCard({
  course,
  isNextUp,
  onPress,
}: {
  course: MobileCourseSummary;
  isNextUp: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const meta = [course.code, course.term].filter(Boolean).join(" · ");
  const targetLabel = course.targetGrade !== null ? formatGrade(course.targetGrade) : null;

  return (
    <Pressable
      accessibilityLabel={`${course.name} average ${formatGrade(course.average)}`}
      accessibilityRole="button"
      android_ripple={{ color: theme.colors.line }}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.courseCard, pressed && styles.buttonPressed]}
    >
      <View>
        <Text style={styles.courseName}>{course.name}</Text>
        {meta ? <Text style={styles.courseMeta}>{meta}</Text> : null}
      </View>

      <View>
        <View style={styles.courseGradeRow}>
          <Text style={styles.courseAverage}>{formatGrade(course.average)}</Text>
          {targetLabel ? <Text style={styles.courseTarget}>Target {targetLabel}</Text> : null}
        </View>
        <View style={styles.courseBulletBar}>
          <BulletBar target={course.targetGrade} value={course.average} />
        </View>
        <Text style={styles.courseCaption}>Based on {course.gradedWeight}% of your grade</Text>
      </View>

      {course.nextItem ? (
        <View style={[styles.nextChip, isNextUp && styles.nextChipActive]}>
          <Text style={[styles.nextChipText, isNextUp && styles.nextChipTextActive]}>
            Next: {course.nextItem.title} · {formatShortDate(course.nextItem.dueAt)}
          </Text>
        </View>
      ) : (
        <Text style={styles.courseCaption}>No upcoming items</Text>
      )}
    </Pressable>
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
    messageError: {
      color: colors.danger,
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
      marginTop: 8,
    },
    form: {
      gap: 12,
      marginTop: 16,
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
    loadingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 8,
    },
    empty: {
      ...theme.text("body", "inkMuted"),
    },
    list: {
      gap: 12,
    },
    courseCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      minHeight: 44,
      padding: 16,
    },
    courseName: {
      ...theme.text("heading", "ink"),
    },
    courseMeta: {
      ...theme.text("body", "inkMuted"),
      marginTop: 4,
    },
    courseGradeRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    courseAverage: {
      color: colors.ink,
      fontFamily: fontFamily.monoBold,
      fontSize: 30,
    },
    courseTarget: {
      ...theme.text("monoTime", "inkMuted"),
    },
    courseBulletBar: {
      marginTop: 8,
    },
    courseCaption: {
      ...theme.text("label", "inkMuted"),
      marginTop: 8,
    },
    nextChip: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface2,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    nextChipActive: {
      backgroundColor: colors.compassSoft,
    },
    nextChipText: {
      ...theme.text("label", "inkMuted"),
    },
    nextChipTextActive: {
      color: colors.compass,
    },
  });
}
