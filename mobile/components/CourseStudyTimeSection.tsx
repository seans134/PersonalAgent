import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatStudyMinutes } from "@personal-agent/core";
import { fetchStudySummary } from "../lib/api";
import { useStudyTimer } from "../lib/study-timer";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { StartStudyButton } from "./StudyTimer";

/** "4 h 20 min studied this term" and Start studying, on the course screen. Reloads when a session is saved. */
export function CourseStudyTimeSection({ accessToken, archived, courseId }: { accessToken: string; archived: boolean; courseId: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { onSessionsChanged } = useStudyTimer();
  const [minutes, setMinutes] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const summary = await fetchStudySummary(accessToken, courseId);
      setMinutes(summary.courseTotalMinutes ?? 0);
    } catch {
      // The course screen works without it.
    }
  }, [accessToken, courseId]);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 0);
    const unsubscribe = onSessionsChanged(() => void load());
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [load, onSessionsChanged]);

  return (
    <View style={styles.row}>
      <Text style={[theme.text("body", "inkMuted"), styles.copy]}>
        {minutes === null ? " " : minutes > 0 ? `${formatStudyMinutes(minutes)} studied this term` : "No study time logged yet"}
      </Text>
      {archived ? null : <StartStudyButton target={{ courseId }} />}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: theme.space.sm,
    },
    copy: {
      flex: 1,
    },
  });
}
