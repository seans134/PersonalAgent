import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatStudyTimer, studyTimerElapsedMs, type StudySessionStartRequest } from "@personal-agent/core";
import { useStudyTimer } from "../lib/study-timer";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

function ElapsedClock({ startedAt, theme }: { startedAt: string; theme: Theme }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  return (
    <Text style={[theme.text("heading", "ink"), { fontVariant: ["tabular-nums"] }]}>
      {now === null ? "--:--" : formatStudyTimer(studyTimerElapsedMs(startedAt, now))}
    </Text>
  );
}

/** The running timer (and the last timer message), shown above the tab bar on every screen. */
export function StudyTimerBar() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { running, busy, notice, stop, discard, dismissNotice } = useStudyTimer();

  if (!running && !notice) return null;

  return (
    <View style={styles.bar}>
      {running ? (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: theme.colors.teal }]} />
          <View style={styles.copy}>
            <Text style={theme.text("monoLabel", "teal")}>Studying</Text>
            <Text numberOfLines={1} style={theme.text("label", "ink")}>
              {running.courseName ?? "General study"}
            </Text>
          </View>
          <ElapsedClock startedAt={running.startedAt} theme={theme} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void stop()}
            style={({ pressed }) => [styles.stopButton, (pressed || busy) && styles.pressed]}
          >
            <Text style={theme.text("label", "onTeal")}>{busy ? "Saving" : "Stop"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            hitSlop={6}
            onPress={discard}
            style={({ pressed }) => [styles.discardButton, (pressed || busy) && styles.pressed]}
          >
            <Text style={theme.text("label", "inkMuted")}>Discard</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <Pressable accessibilityHint="Dismisses this message" onPress={dismissNotice} style={styles.noticeRow}>
          <Text style={[theme.text("body", "ink"), styles.copy]}>{notice}</Text>
          <Text style={theme.text("monoLabel", "inkMuted")}>Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Starts the study timer for a course, a course item (exam), or a Today study block.
 * While a timer runs it says so instead, so a second timer can't be started.
 */
export function StartStudyButton({ target, label = "Start studying" }: { target: StudySessionStartRequest; label?: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { running, busy, start } = useStudyTimer();
  const isThis =
    running !== null &&
    (target.planItemKey
      ? running.planItemKey === target.planItemKey
      : target.courseItemId
        ? running.courseItemId === target.courseItemId && !running.planItemKey
        : running.courseId === (target.courseId ?? null) && !running.courseItemId);
  const disabled = busy || running !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => void start(target)}
      style={({ pressed }) => [
        styles.startButton,
        isThis && { backgroundColor: theme.colors.teal },
        (pressed || (disabled && !isThis)) && styles.pressed,
      ]}
    >
      <Text style={theme.text("monoTime", isThis ? "onTeal" : "teal")}>
        {isThis ? "Studying now" : running ? "Timer running" : label}
      </Text>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.line,
      borderTopWidth: 1,
      gap: space.xs,
      paddingHorizontal: space.base,
      paddingVertical: space.sm,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
    },
    dot: {
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    copy: {
      flex: 1,
    },
    stopButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: space.md,
    },
    discardButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: space.sm,
    },
    noticeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.sm,
    },
    startButton: {
      alignSelf: "flex-start",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    pressed: {
      opacity: 0.6,
    },
  });
}
