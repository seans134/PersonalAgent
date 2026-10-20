import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LETTER_GRADES, type LetterGrade } from "@personal-agent/core";
import { updateMobileCourse, type MobileCourseDetail } from "../lib/api";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

type Course = MobileCourseDetail["course"];

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(Number(value));
}

function formFrom(course: Course) {
  return {
    name: course.name,
    code: course.code ?? "",
    term: course.term ?? "",
    targetGrade: numberText(course.target_grade),
    credits: numberText(course.credits),
    finalGrade: (course.final_grade_override ?? null) as LetterGrade | null,
  };
}

/** Edits the course's details, including the credits and final grade that GPA uses. Mirrors the web course-details-form. */
export function CourseDetailsSection({
  accessToken,
  course,
  onSaved,
}: {
  accessToken: string;
  course: Course;
  onSaved: () => Promise<void>;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formFrom(course));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const targetGrade = Number(form.targetGrade);
      const credits = Number(form.credits);
      if (form.targetGrade.trim() && !Number.isFinite(targetGrade)) throw new Error("Target grade must be between 0 and 100.");
      if (form.credits.trim() && !Number.isFinite(credits)) throw new Error("Credits must be between 0 and 20.");
      await updateMobileCourse(accessToken, course.id, {
        name: form.name.trim(),
        code: form.code.trim() || null,
        term: form.term.trim() || null,
        targetGrade: form.targetGrade.trim() ? targetGrade : null,
        credits: form.credits.trim() ? credits : null,
        finalGrade: form.finalGrade,
      });
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save course.");
    }
    setSaving(false);
  }

  const summary = [
    course.credits !== null && course.credits !== undefined ? `${Number(course.credits)} credits` : "No credits set",
    course.final_grade_override ? `Final ${course.final_grade_override}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.panelLabel}>Course details</Text>
          {!open ? <Text style={styles.caption}>{summary}</Text> : null}
        </View>
        {!open ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setForm(formFrom(course));
              setOpen(true);
            }}
            style={styles.smallButton}
          >
            <Text style={styles.smallButtonText}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.form}>
          <Field label="Name" onChangeText={(v) => update("name", v)} styles={styles} theme={theme} value={form.name} />
          <Field label="Code" onChangeText={(v) => update("code", v)} placeholder="CHEM 201" styles={styles} theme={theme} value={form.code} />
          <Field label="Term" onChangeText={(v) => update("term", v)} placeholder="Fall 2026" styles={styles} theme={theme} value={form.term} />
          <Field
            decimal
            label="Target grade (%)"
            onChangeText={(v) => update("targetGrade", v)}
            placeholder="90"
            styles={styles}
            theme={theme}
            value={form.targetGrade}
          />
          <Field
            decimal
            label="Credits"
            onChangeText={(v) => update("credits", v)}
            placeholder="3"
            styles={styles}
            theme={theme}
            value={form.credits}
          />
          <Text style={styles.label}>Final grade</Text>
          <ScrollView contentContainerStyle={styles.chipRow} horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
            {[null, ...LETTER_GRADES].map((letter) => {
              const active = form.finalGrade === letter;
              return (
                <Pressable
                  accessibilityLabel={letter ? `Final grade ${letter}` : "Not final yet"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={letter ?? "none"}
                  onPress={() => update("finalGrade", letter)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{letter ?? "Not final"}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.caption}>
            Once the course is over, pick the letter from your transcript so your GPA uses it. Until then GPA uses your
            current grade.
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              disabled={saving || !form.name.trim()}
              onPress={() => void save()}
              style={({ pressed }) => [styles.primaryButton, (pressed || saving || !form.name.trim()) && styles.pressed]}
            >
              {saving ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.primaryText}>Save</Text>}
            </Pressable>
            <Pressable
              onPress={() => {
                setOpen(false);
                setError(null);
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

function Field({
  decimal,
  label,
  onChangeText,
  placeholder,
  styles,
  theme,
  value,
}: {
  decimal?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={decimal ? "decimal-pad" : "default"}
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
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      padding: 16,
    },
    headerRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    headerCopy: {
      flexShrink: 1,
      gap: 4,
    },
    panelLabel: {
      ...theme.text("title", "ink"),
    },
    caption: {
      ...theme.text("label", "inkMuted"),
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
    chipRow: {
      gap: 8,
    },
    chip: {
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      minWidth: 44,
      alignItems: "center",
      paddingHorizontal: 12,
    },
    chipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    chipText: {
      ...theme.text("label", "inkMuted"),
    },
    chipTextActive: {
      color: colors.onTeal,
    },
    errorText: {
      ...theme.text("label", "danger"),
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
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      minWidth: 72,
      paddingHorizontal: 12,
    },
    smallButtonText: {
      ...theme.text("label", "teal"),
    },
    pressed: {
      opacity: 0.78,
    },
  });
}
