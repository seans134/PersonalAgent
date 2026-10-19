import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  analyticsEvents,
  formatSemesterDueDay,
  formatSemesterLoad,
  formatSemesterWeekRange,
  semesterCrunchLabel,
  semesterItemMeta,
  type SemesterTimeline,
  type SemesterWeek,
} from "@personal-agent/core";
import { captureEvent } from "../lib/analytics";
import { fetchMobileSemester } from "../lib/api";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { Icon } from "./Icon";

type SemesterScreenProps = {
  accessToken: string;
  onBack: () => void;
  onOpenCourse: (courseId: string) => void;
};

export function SemesterScreen({ accessToken, onBack, onOpenCourse }: SemesterScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [timeline, setTimeline] = useState<SemesterTimeline | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One semester_viewed per term shown on this visit.
  const viewedTerms = useRef(new Set<string>());

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchMobileSemester(accessToken, term);
      setTimeline(result);
      const key = result.term ?? "";
      if (!viewedTerms.current.has(key)) {
        viewedTerms.current.add(key);
        captureEvent(analyticsEvents.semesterViewed, {
          week_count: result.weeks.length,
          crunch_week_count: result.crunchWeekCount,
        });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load semester.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, term]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectTerm(next: string) {
    if (next === timeline?.term) return;
    setLoading(true);
    setShowPast(false);
    setTerm(next);
  }

  const hasItems = timeline ? timeline.weeks.length > 0 || timeline.pastWeeks.length > 0 : false;

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
          Semester
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
        <Text style={styles.body}>
          Every exam and deadline{timeline?.term ? ` in ${timeline.term}` : ""}, week by week, so you can see crunch
          weeks coming.
        </Text>

        {timeline && timeline.terms.length > 1 ? (
          <ScrollView contentContainerStyle={styles.termRow} horizontal showsHorizontalScrollIndicator={false}>
            {timeline.terms.map((option) => {
              const active = option === timeline.term;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={option}
                  onPress={() => selectTerm(option)}
                  style={[styles.termChip, active && styles.termChipActive]}
                >
                  <Text style={[styles.termChipText, active && styles.termChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading && !timeline ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.teal} />
            <Text style={styles.body}>Loading semester...</Text>
          </View>
        ) : error && !timeline ? (
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
        ) : timeline && !hasItems ? (
          <Text style={styles.body}>No dated exams or deadlines yet. Add them to a course, or import a syllabus from Courses.</Text>
        ) : timeline ? (
          <>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {timeline.pastWeeks.length > 0 ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowPast((v) => !v)} style={styles.smallButton}>
                <Text style={styles.smallButtonText}>
                  {showPast ? "Hide earlier weeks" : `Show earlier weeks (${timeline.pastWeeks.length})`}
                </Text>
              </Pressable>
            ) : null}
            {showPast
              ? timeline.pastWeeks.map((week) => (
                  <WeekCard key={week.weekStart} onOpenCourse={onOpenCourse} styles={styles} week={week} />
                ))
              : null}
            {timeline.weeks.length > 0 ? (
              timeline.weeks.map((week) => (
                <WeekCard key={week.weekStart} onOpenCourse={onOpenCourse} styles={styles} week={week} />
              ))
            ) : (
              <Text style={styles.body}>Nothing left this term. Everything due is behind you.</Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function WeekCard({
  onOpenCourse,
  styles,
  week,
}: {
  onOpenCourse: (courseId: string) => void;
  styles: ReturnType<typeof makeStyles>;
  week: SemesterWeek;
}) {
  const crunch = semesterCrunchLabel(week);
  return (
    <View style={[styles.weekCard, crunch ? styles.weekCardCrunch : null]}>
      <View style={styles.weekHeader}>
        <Text style={styles.weekRange}>
          {formatSemesterWeekRange(week)}
          {week.isCurrent ? <Text style={styles.thisWeek}>  THIS WEEK</Text> : null}
        </Text>
        <Text style={styles.weekLoad}>{formatSemesterLoad(week)}</Text>
      </View>
      {crunch ? (
        <View style={styles.crunchChip}>
          <Text style={styles.crunchText}>{crunch}</Text>
        </View>
      ) : null}
      {week.items.map((item) => (
        <Pressable
          accessibilityLabel={`${item.courseLabel} ${item.title}${item.isDone ? ", done" : ""}. Open course.`}
          accessibilityRole="button"
          key={item.id}
          onPress={() => onOpenCourse(item.courseId)}
          style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
        >
          <Text style={[styles.itemTitle, item.isDone && styles.itemDone]}>
            {item.courseLabel} {item.title}
          </Text>
          <Text style={styles.itemMeta}>
            {formatSemesterDueDay(item.dueLocalDate)} · {semesterItemMeta(item)}
            {item.isDone ? " · Done" : ""}
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
    errorText: {
      ...theme.text("label", "danger"),
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
      gap: 12,
      padding: 16,
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
    termRow: {
      gap: 8,
    },
    termChip: {
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 36,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    termChipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    termChipText: {
      ...theme.text("label", "inkMuted"),
    },
    termChipTextActive: {
      color: colors.onTeal,
    },
    weekCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    weekCardCrunch: {
      borderColor: colors.warning,
      borderWidth: 1.5,
    },
    weekHeader: {
      alignItems: "baseline",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "space-between",
    },
    weekRange: {
      ...theme.text("heading", "ink"),
    },
    thisWeek: {
      ...theme.text("monoLabel", "teal"),
    },
    weekLoad: {
      ...theme.text("monoTime", "inkMuted"),
    },
    crunchChip: {
      alignSelf: "flex-start",
      backgroundColor: colors.surface2,
      borderColor: colors.warning,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    crunchText: {
      ...theme.text("label", "warning"),
    },
    itemRow: {
      borderRadius: 6,
      gap: 2,
      minHeight: 44,
      justifyContent: "center",
      paddingVertical: 4,
    },
    pressed: {
      opacity: 0.7,
    },
    itemTitle: {
      ...theme.text("body", "ink"),
    },
    itemDone: {
      color: colors.inkMuted,
      textDecorationLine: "line-through",
    },
    itemMeta: {
      ...theme.text("monoTime", "inkMuted"),
    },
  });
}
