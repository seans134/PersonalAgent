import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { shareCountsLabel, type CourseSharePreview } from "@personal-agent/core";
import { fetchMobileSharedCoursePreview, joinMobileSharedCourse } from "../lib/api";
import { useTheme, type Theme } from "../lib/theme";
import { DetailHeader } from "./MobileAppShell";

const KIND_LABEL: Record<CourseSharePreview["upcoming"][number]["kind"], string> = {
  exam: "Exam",
  quiz: "Quiz",
  assignment: "Assignment",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Opened from a join link (atlas://join/<token>): preview a classmate's course, then add it. */
export function JoinCourseScreen({
  accessToken,
  token,
  onJoined,
  onClose,
}: {
  accessToken: string;
  token: string;
  onJoined: (courseId: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [preview, setPreview] = useState<CourseSharePreview | null>(null);
  const [ownCourseId, setOwnCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetchMobileSharedCoursePreview(accessToken, token)
      .then((result) => {
        if (cancelled) return;
        setPreview(result.preview);
        setOwnCourseId(result.ownCourseId);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This course link isn't active.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, token]);

  async function join() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await joinMobileSharedCourse(accessToken, token);
      onJoined(result.courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add course.");
      setBusy(false);
    }
  }

  const meta = preview ? [preview.course.code, preview.course.term].filter(Boolean).join(" · ") : "";

  return (
    <View style={styles.screen}>
      <DetailHeader backLabel="Close" onBack={onClose} title="Shared course" />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={theme.colors.teal} />
            <Text style={styles.body}>Loading course...</Text>
          </View>
        ) : preview ? (
          <View style={styles.panel}>
            <Text style={styles.title}>{preview.course.name}</Text>
            {meta ? <Text style={styles.body}>{meta}</Text> : null}
            <Text style={styles.counts}>{shareCountsLabel(preview.counts)}</Text>
            {preview.categoryCount > 0 ? (
              <Text style={styles.body}>
                {preview.categoryCount} grade {preview.categoryCount === 1 ? "category" : "categories"} with weights
              </Text>
            ) : null}

            {preview.upcoming.length > 0 ? (
              <View style={styles.upcoming}>
                <Text style={styles.sectionLabel}>Coming up</Text>
                {preview.upcoming.map((item, index) => (
                  <View key={`${item.dueAt}-${index}`} style={styles.upcomingRow}>
                    <Text style={styles.upcomingTitle}>
                      <Text style={styles.body}>{KIND_LABEL[item.kind]} · </Text>
                      {item.title}
                    </Text>
                    <Text style={styles.upcomingDate}>{formatDue(item.dueAt)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.note}>
              {"A classmate shared this course's dates and grade weights. Your grades and notes stay private to you."}
            </Text>

            {ownCourseId ? (
              <Pressable onPress={() => onJoined(ownCourseId)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>This is your course. Open it</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={busy}
                onPress={() => void join()}
                style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}
              >
                {busy ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.primaryText}>Add to my courses</Text>}
              </Pressable>
            )}
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      gap: 18,
      padding: 24,
      paddingBottom: 40,
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
      gap: 10,
      padding: 16,
    },
    title: {
      ...theme.text("title", "ink"),
    },
    body: {
      ...theme.text("body", "inkMuted"),
    },
    counts: {
      ...theme.text("heading", "ink"),
    },
    upcoming: {
      gap: 8,
      marginTop: 6,
    },
    sectionLabel: {
      ...theme.text("monoLabel", "inkMuted"),
    },
    upcomingRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    upcomingTitle: {
      ...theme.text("body", "ink"),
      flexShrink: 1,
    },
    upcomingDate: {
      ...theme.text("monoTime", "inkMuted"),
    },
    note: {
      ...theme.text("label", "inkMuted"),
      marginTop: 6,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      justifyContent: "center",
      marginTop: 6,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    primaryText: {
      ...theme.text("heading", "surface"),
    },
    pressed: {
      opacity: 0.78,
    },
    errorText: {
      ...theme.text("label", "danger"),
    },
  });
}
