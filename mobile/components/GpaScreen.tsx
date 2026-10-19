import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  analyticsEvents,
  describeGpaNeeded,
  formatGpa,
  formatGradePercent,
  gpaScale,
  GPA_EXCLUSION_COPY,
  GPA_STATUS_COPY,
  parseGpaTargetInput,
  type GpaSummary,
  type GpaTerm,
} from "@personal-agent/core";
import { captureEvent } from "../lib/analytics";
import { fetchMobileGpa } from "../lib/api";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { Icon } from "./Icon";

type GpaScreenProps = {
  accessToken: string;
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
  /** The typed cumulative target, kept by App.tsx so it survives opening a course and coming back. */
  targetText: string;
  onTargetTextChange: (text: string) => void;
};

function termName(term: string | null): string {
  return term ?? "No term";
}

export function GpaScreen({ accessToken, onBack, onOpenCourse, targetText, onTargetTextChange }: GpaScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [summary, setSummary] = useState<GpaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The target the shown summary was loaded with; "What do I need?" applies the typed one. The scale
  // isn't known before the first load, so no upper bound here (above the top comes back out of reach).
  const [appliedTarget, setAppliedTarget] = useState<number | null>(() =>
    parseGpaTargetInput(targetText, Number.POSITIVE_INFINITY),
  );
  const viewed = useRef(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError(null);
    try {
      const result = await fetchMobileGpa(accessToken, { target: appliedTarget });
      if (id !== requestId.current) return;
      setSummary(result);
      if (!viewed.current) {
        viewed.current = true;
        captureEvent(analyticsEvents.gpaViewed, { term_count: result.terms.length, course_count: result.courseCount });
      }
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load GPA.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accessToken, appliedTarget]);

  useEffect(() => {
    void load();
  }, [load]);

  const scale = gpaScale(summary?.scale);
  const typedTarget = parseGpaTargetInput(targetText, scale.max);
  const targetInvalid = targetText.trim() !== "" && typedTarget === null;
  const neededCopy = summary ? describeGpaNeeded(summary.needed) : null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to courses" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.backButton}>
          <Icon color={theme.colors.teal} name="back" size={20} strokeWidth={2.2} />
          <Text style={styles.backText}>Courses</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          GPA
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[theme.colors.teal]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            refreshing={refreshing}
            tintColor={theme.colors.teal}
          />
        }
      >
        <Text style={styles.body}>Weighted by credits on the {scale.label}. Change the scale in Profile.</Text>

        {loading && !summary ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.teal} />
            <Text style={styles.body}>Loading GPA...</Text>
          </View>
        ) : error && !summary ? (
          <View style={styles.panel}>
            <Text style={styles.body}>{error}</Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setLoading(true);
                void load();
              }}
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : summary ? (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>CUMULATIVE</Text>
              <View style={styles.heroRow}>
                <Text style={styles.heroGpa}>{formatGpa(summary.cumulative.gpa)}</Text>
                <Text style={styles.heroMeta}>
                  {summary.cumulative.credits} credits
                  {summary.cumulative.inProgressCredits > 0 ? `, ${summary.cumulative.inProgressCredits} in progress` : ""}
                </Text>
              </View>
              {summary.cumulative.inProgressCredits > 0 ? (
                <Text style={styles.body}>
                  Final grades only: {formatGpa(summary.cumulative.finalGpa)} over {summary.cumulative.finalCredits} credits.
                  In-progress courses count at their current grade.
                </Text>
              ) : null}
              {summary.projection.targetCourseCount > 0 ? (
                <Text style={styles.bodyInk}>If you hit your target grades: {formatGpa(summary.projection.gpa)}</Text>
              ) : null}

              <Text style={styles.label}>Cumulative target</Text>
              <View style={styles.targetRow}>
                <TextInput
                  accessibilityLabel="Cumulative GPA target"
                  keyboardType="decimal-pad"
                  onChangeText={onTargetTextChange}
                  onSubmitEditing={() => setAppliedTarget(typedTarget)}
                  placeholder={scale.max === 4 ? "3.70" : "3.90"}
                  placeholderTextColor={theme.colors.inkMuted}
                  returnKeyType="done"
                  style={styles.targetInput}
                  value={targetText}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={targetInvalid}
                  hitSlop={8}
                  onPress={() => setAppliedTarget(typedTarget)}
                  style={[styles.smallButton, targetInvalid && styles.pressed]}
                >
                  <Text style={styles.smallButtonText}>What do I need?</Text>
                </Pressable>
              </View>
              {targetInvalid ? (
                <Text style={styles.errorText}>Enter a GPA above 0 and up to {formatGpa(scale.max)}.</Text>
              ) : neededCopy ? (
                <Text style={[styles.bodyInk, summary.needed.status === "out_of_reach" && styles.warningText]}>{neededCopy}</Text>
              ) : null}
            </View>

            {summary.terms.length > 0 ? (
              summary.terms.map((term) => (
                <TermCard key={term.term ?? ""} onOpenCourse={onOpenCourse} styles={styles} term={term} />
              ))
            ) : (
              <Text style={styles.body}>
                No courses count toward your GPA yet. Add credits to a course from its Course details, and grades as they
                come in.
              </Text>
            )}

            {summary.excluded.length > 0 ? (
              <View style={styles.panel}>
                <Text style={styles.termName}>Not counted</Text>
                <Text style={styles.meta}>Set credits in Course details, or add a grade, to count these.</Text>
                {summary.excluded.map((course) => (
                  <Pressable
                    accessibilityLabel={`${course.label}, ${GPA_EXCLUSION_COPY[course.reason]}. Open course.`}
                    accessibilityRole="button"
                    key={course.id}
                    onPress={() => onOpenCourse(course.id)}
                    style={({ pressed }) => [styles.courseRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.courseLabel}>
                      {course.label}
                      {course.term ? <Text style={styles.meta}> · {course.term}</Text> : null}
                    </Text>
                    <Text style={styles.meta}>{GPA_EXCLUSION_COPY[course.reason]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TermCard({
  onOpenCourse,
  styles,
  term,
}: {
  onOpenCourse: (courseId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  term: GpaTerm;
}) {
  const showProjected = !term.isFinal && term.projectedGpa !== null && formatGpa(term.projectedGpa) !== formatGpa(term.gpa);
  return (
    <View style={styles.panel}>
      <View style={styles.termHeader}>
        <Text style={styles.termName}>{termName(term.term)}</Text>
        <Text style={styles.termGpa}>
          {formatGpa(term.gpa)} <Text style={styles.meta}>· {term.credits} cr · {term.isFinal ? "Final" : "In progress"}</Text>
        </Text>
      </View>
      {showProjected ? <Text style={styles.meta}>At your target grades: {formatGpa(term.projectedGpa)}</Text> : null}
      {term.courses.length === 0 ? <Text style={styles.body}>No grades yet this term.</Text> : null}
      {term.courses.map((course) => (
        <Pressable
          accessibilityLabel={`${course.label}, ${course.credits} credits, ${course.letter}, ${GPA_STATUS_COPY[course.status]}. Open course.`}
          accessibilityRole="button"
          key={course.id}
          onPress={() => onOpenCourse(course.id)}
          style={({ pressed }) => [styles.courseRow, pressed && styles.pressed]}
        >
          <View style={styles.courseTop}>
            <Text style={styles.courseLabel}>{course.label}</Text>
            <Text style={styles.courseLetter}>{course.letter}</Text>
          </View>
          <Text style={styles.meta}>
            {course.credits} cr · {course.points.toFixed(1)} pts
            {course.percent !== null ? ` · ${formatGradePercent(course.percent)}` : ""} · {GPA_STATUS_COPY[course.status]}
          </Text>
        </Pressable>
      ))}
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
      gap: 12,
      padding: 24,
      paddingBottom: 40,
    },
    body: {
      ...theme.text("body", "inkMuted"),
    },
    bodyInk: {
      ...theme.text("body", "ink"),
    },
    warningText: {
      color: colors.warning,
    },
    errorText: {
      ...theme.text("label", "danger"),
    },
    eyebrow: {
      ...theme.text("monoLabel", "inkMuted"),
    },
    label: {
      ...theme.text("label", "ink"),
      marginTop: 4,
    },
    loadingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      paddingVertical: 8,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    heroRow: {
      alignItems: "baseline",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    heroGpa: {
      ...theme.text("displayXl", "ink"),
    },
    heroMeta: {
      ...theme.text("monoTime", "inkMuted"),
    },
    targetRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    targetInput: {
      ...theme.text("bodyLg", "ink"),
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 44,
      minWidth: 96,
      paddingHorizontal: 12,
    },
    smallButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 82,
      paddingHorizontal: 12,
    },
    smallButtonText: {
      ...theme.text("label", "teal"),
    },
    termHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    termName: {
      ...theme.text("heading", "ink"),
    },
    termGpa: {
      ...theme.text("monoTime", "ink"),
    },
    meta: {
      ...theme.text("monoTime", "inkMuted"),
    },
    courseRow: {
      borderTopColor: colors.line,
      borderTopWidth: 1,
      gap: 2,
      justifyContent: "center",
      minHeight: 44,
      paddingTop: 8,
    },
    courseTop: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
    },
    courseLabel: {
      ...theme.text("body", "ink"),
      flexShrink: 1,
    },
    courseLetter: {
      ...theme.text("heading", "ink"),
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
