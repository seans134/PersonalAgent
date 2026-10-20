import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { formatStudyMinutes, parseStudyMinutesInput, STUDY_SESSION_MAX_MINUTES, studyDayLabel, type StudySummary } from "@personal-agent/core";
import { shiftDate } from "@personal-agent/core/calendar";
import { fetchMobileCourses, fetchStudySummary, logManualStudySession } from "../lib/api";
import { errorHaptic, successHaptic } from "../lib/haptics";
import { useStudyTimer } from "../lib/study-timer";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

type CourseOption = { id: string; name: string };

/** Days a student can pick for manual entry: today and the 6 before it. */
const MANUAL_DAY_CHOICES = 7;

function dayChoiceLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === shiftDate(today, -1)) return "Yesterday";
  return `${studyDayLabel(date)} ${Number(date.slice(8))}`;
}

/**
 * Insights "Study time": this week by course, a 7-day bar, the study streak, a standalone timer
 * and "Log study time" for time studied away from the timer. refreshKey reloads it (pull to refresh).
 */
export function StudyTimeSection({ accessToken, refreshKey }: { accessToken: string; refreshKey: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { running, busy, start, onSessionsChanged } = useStudyTimer();
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [minutesText, setMinutesText] = useState("");
  const [logging, setLogging] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setSummary(await fetchStudySummary(accessToken));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load study time.");
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    return () => clearTimeout(timeout);
  }, [load, refreshKey]);

  useEffect(() => onSessionsChanged(() => void load()), [load, onSessionsChanged]);

  useEffect(() => {
    let active = true;
    void fetchMobileCourses(accessToken)
      .then((response) => {
        if (!active) return;
        const options = response.courses
          .filter((course) => course.archivedAt === null)
          .map((course) => ({ id: course.id, name: course.name }));
        setCourses(options);
        setCourseId((current) => current ?? options[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken]);

  const today = summary?.today ?? null;
  const selectedDate = logDate ?? today;

  async function handleLog() {
    const minutes = parseStudyMinutesInput(minutesText);
    if (minutes === null) {
      setMessage({ tone: "error", text: `Enter whole minutes from 1 to ${STUDY_SESSION_MAX_MINUTES}.` });
      return;
    }
    if (!selectedDate) return;
    setLogging(true);
    setMessage(null);
    try {
      await logManualStudySession(accessToken, { courseId, date: selectedDate, minutes });
      successHaptic();
      setMinutesText("");
      setMessage({ tone: "info", text: `Logged ${formatStudyMinutes(minutes)}.` });
      await load();
    } catch (logError) {
      errorHaptic();
      setMessage({ tone: "error", text: logError instanceof Error ? logError.message : "Unable to log study time." });
    }
    setLogging(false);
  }

  const maxDay = summary ? Math.max(...summary.last7Days.map((day) => day.minutes), 1) : 1;
  const maxCourse = summary?.weekByCourse[0]?.minutes ?? 1;
  const courseChoices: Array<{ id: string | null; name: string }> = [...courses, { id: null, name: "No course" }];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={theme.text("title", "ink")}>Study time</Text>
        <Text style={theme.text("body", "inkMuted")}>From the study timer and time you log. Weeks start Monday.</Text>
      </View>

      {loading && !summary ? <ActivityIndicator color={theme.colors.teal} /> : null}
      {error && !summary ? <Text style={theme.text("body", "danger")}>{error}</Text> : null}

      {summary ? (
        <>
          <View style={styles.statRow}>
            <Stat label="This week" theme={theme} styles={styles} value={formatStudyMinutes(summary.weekTotalMinutes)} />
            <Stat label="Today" theme={theme} styles={styles} value={formatStudyMinutes(summary.todayMinutes)} />
            <Stat
              label="Streak"
              theme={theme}
              styles={styles}
              value={`${summary.streakDays} ${summary.streakDays === 1 ? "day" : "days"}`}
            />
          </View>

          <Text style={theme.text("monoLabel", "inkMuted")}>Last 7 days</Text>
          <View accessibilityLabel="Study minutes for the last 7 days" style={styles.bars}>
            {summary.last7Days.map((day) => (
              <View key={day.date} style={styles.barColumn}>
                <Text style={theme.text("monoTime", "inkMuted")}>{day.minutes > 0 ? String(day.minutes) : " "}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: day.minutes > 0 ? theme.colors.teal : theme.colors.line,
                        height: `${day.minutes > 0 ? Math.max(6, (day.minutes / maxDay) * 100) : 3}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={theme.text("monoTime", "inkMuted")}>{studyDayLabel(day.date)}</Text>
              </View>
            ))}
          </View>

          <Text style={theme.text("monoLabel", "inkMuted")}>This week by course</Text>
          {summary.weekByCourse.length > 0 ? (
            summary.weekByCourse.map((entry) => (
              <View key={entry.courseId ?? "none"} style={styles.courseRow}>
                <View style={styles.courseHead}>
                  <Text numberOfLines={1} style={[theme.text("label", "ink"), styles.flex]}>
                    {entry.courseName ?? "No course"}
                  </Text>
                  <Text style={theme.text("monoTime", "inkMuted")}>{formatStudyMinutes(entry.minutes)}</Text>
                </View>
                <View style={styles.courseTrack}>
                  <View style={[styles.courseFill, { width: `${(entry.minutes / Math.max(maxCourse, 1)) * 100}%` }]} />
                </View>
              </View>
            ))
          ) : (
            <Text style={theme.text("body", "inkMuted")}>No study time yet this week. Start a timer or log time below.</Text>
          )}
        </>
      ) : null}

      <View style={styles.divider} />

      <Text style={theme.text("monoLabel", "inkMuted")}>Course</Text>
      <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>
        {courseChoices.map((choice) => {
          const active = choice.id === courseId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={choice.id ?? "none"}
              onPress={() => setCourseId(choice.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={theme.text("label", active ? "onTeal" : "inkMuted")}>{choice.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        disabled={busy || running !== null}
        onPress={() => void start({ courseId })}
        style={({ pressed }) => [styles.primaryButton, (pressed || busy || running !== null) && styles.pressed]}
      >
        <Text style={theme.text("heading", "onTeal")}>{running ? "Timer running" : "Start studying"}</Text>
      </Pressable>

      <Text style={[theme.text("heading", "ink"), styles.logTitle]}>Log study time</Text>
      {today ? (
        <ScrollView horizontal contentContainerStyle={styles.chipRow} showsHorizontalScrollIndicator={false}>
          {Array.from({ length: MANUAL_DAY_CHOICES }, (_, offset) => shiftDate(today, -offset)).map((date) => {
            const active = date === selectedDate;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={date}
                onPress={() => setLogDate(date)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={theme.text("label", active ? "onTeal" : "inkMuted")}>{dayChoiceLabel(date, today)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.logRow}>
        <TextInput
          accessibilityLabel="Minutes studied"
          keyboardType="number-pad"
          onChangeText={setMinutesText}
          placeholder="Minutes"
          placeholderTextColor={theme.colors.inkMuted}
          style={[styles.input, styles.flex]}
          value={minutesText}
        />
        <Pressable
          accessibilityRole="button"
          disabled={logging || !today}
          onPress={() => void handleLog()}
          style={({ pressed }) => [styles.secondaryButton, (pressed || logging) && styles.pressed]}
        >
          {logging ? <ActivityIndicator color={theme.colors.teal} /> : <Text style={theme.text("heading", "teal")}>Log time</Text>}
        </Pressable>
      </View>
      {message ? <Text style={theme.text("body", message.tone === "error" ? "danger" : "ink")}>{message.text}</Text> : null}
    </View>
  );
}

function Stat({ label, value, theme, styles }: { label: string; value: string; theme: Theme; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={theme.text("monoLabel", "inkMuted")}>{label}</Text>
      <Text style={theme.text("heading", "teal")}>{value}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: space.sm,
      padding: space.base,
    },
    header: {
      gap: space.xs2,
    },
    statRow: {
      flexDirection: "row",
      gap: space.sm,
    },
    stat: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      flex: 1,
      gap: space.xs2,
      padding: space.sm,
    },
    bars: {
      flexDirection: "row",
      gap: space.xs,
      height: 130,
    },
    barColumn: {
      alignItems: "center",
      flex: 1,
      gap: 2,
    },
    barTrack: {
      flex: 1,
      justifyContent: "flex-end",
      width: "100%",
    },
    barFill: {
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
      width: "100%",
    },
    courseRow: {
      gap: 4,
    },
    courseHead: {
      flexDirection: "row",
      gap: space.sm,
    },
    courseTrack: {
      backgroundColor: colors.surface2,
      borderRadius: 4,
      height: 8,
      overflow: "hidden",
    },
    courseFill: {
      backgroundColor: colors.teal,
      borderRadius: 4,
      height: 8,
    },
    flex: {
      flex: 1,
    },
    divider: {
      backgroundColor: colors.line,
      height: 1,
      marginVertical: space.xs,
    },
    chipRow: {
      gap: space.xs,
    },
    chip: {
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
    },
    chipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: 48,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: space.base,
    },
    logTitle: {
      marginTop: space.sm,
    },
    logRow: {
      flexDirection: "row",
      gap: space.sm,
    },
    input: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      color: colors.ink,
      minHeight: 48,
      paddingHorizontal: space.md,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
