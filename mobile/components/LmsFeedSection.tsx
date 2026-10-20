import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  LMS_PROVIDER_LABELS,
  lmsLastSyncedLabel,
  lmsSyncSummary,
  looksLikeLmsFeedUrl,
  type LmsDeadlineKind,
  type LmsFeedStatusResponse,
  type LmsFeedSyncResponse,
  type LmsPendingItem,
} from "@personal-agent/core";
import {
  connectLmsFeed,
  disconnectLmsFeed,
  fetchLmsFeedStatus,
  resolveLmsPendingItem,
  syncLmsFeed,
  type MobileCourseSummary,
} from "../lib/api";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";

type LmsFeedSectionProps = {
  accessToken: string;
  /** Active courses, for assigning deadlines that matched none. */
  courses: MobileCourseSummary[];
  /** Called after deadlines were added or changed, so the course list reloads. */
  onDeadlinesChanged: () => void;
};

const KIND_LABELS: Record<LmsDeadlineKind, string> = { assignment: "Assignment", quiz: "Quiz", exam: "Exam" };

const WHERE_TO_FIND = [
  "Canvas: Calendar → Calendar Feed → copy the link.",
  "Brightspace (D2L): Calendar → Subscribe → copy the link.",
  "Moodle: Calendar → Import or export calendars → Export → Get calendar URL.",
  "Blackboard: Calendar → Settings → Share calendar → copy the link.",
];

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Courses: connect an LMS calendar feed, sync it, and sort deadlines that didn't match a course.
 * Mounting syncs when the last sync is over 12 hours old (same API and rules as web).
 */
export function LmsFeedSection({ accessToken, courses, onDeadlinesChanged }: LmsFeedSectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [status, setStatus] = useState<LmsFeedStatusResponse | null>(null);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const autoSynced = useRef(false);

  const afterSync = useCallback(
    (result: LmsFeedSyncResponse, announce: boolean) => {
      setStatus(result);
      if (!result.synced || !result.counts) return;
      const changed = result.counts.added > 0 || result.counts.updated > 0;
      if (changed) onDeadlinesChanged();
      if (announce || changed) setMessage({ text: `Synced: ${lmsSyncSummary(result.counts)}.`, tone: "info" });
    },
    [onDeadlinesChanged],
  );

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const current = await fetchLmsFeedStatus(accessToken);
          if (cancelled) return;
          setStatus(current);
          if (current.feed?.stale && !autoSynced.current) {
            autoSynced.current = true;
            try {
              const result = await syncLmsFeed(accessToken, "auto");
              if (!cancelled) afterSync(result, false);
            } catch {
              // The failure is saved on the feed (lastError); show it from a fresh status.
              const reloaded = await fetchLmsFeedStatus(accessToken).catch(() => null);
              if (reloaded && !cancelled) setStatus(reloaded);
            }
          }
        } catch (error) {
          if (!cancelled) setMessage({ text: error instanceof Error ? error.message : "Unable to load your LMS feed.", tone: "error" });
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [accessToken, afterSync]);

  async function connect() {
    if (!looksLikeLmsFeedUrl(url)) {
      setMessage({ text: "Paste the full calendar feed link. It starts with https:// or webcal://.", tone: "error" });
      return;
    }
    setBusy("connect");
    setMessage(null);
    try {
      const result = await connectLmsFeed(accessToken, url);
      setUrl("");
      setEditing(false);
      afterSync(result, true);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to connect your LMS feed.", tone: "error" });
    }
    setBusy(null);
  }

  async function syncNow() {
    setBusy("sync");
    setMessage(null);
    try {
      afterSync(await syncLmsFeed(accessToken, "manual"), true);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to sync your LMS feed.", tone: "error" });
      const reloaded = await fetchLmsFeedStatus(accessToken).catch(() => null);
      if (reloaded) setStatus(reloaded);
    }
    setBusy(null);
  }

  function confirmDisconnect() {
    Alert.alert("Disconnect LMS feed?", "Deadlines already added stay in your courses.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void disconnect() },
    ]);
  }

  async function disconnect() {
    setBusy("disconnect");
    setMessage(null);
    try {
      await disconnectLmsFeed(accessToken);
      setStatus({ feed: null, needsCourse: [] });
      setMessage({ text: "LMS feed disconnected. Deadlines already added stay in your courses.", tone: "info" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to disconnect your LMS feed.", tone: "error" });
    }
    setBusy(null);
  }

  const feed = status?.feed ?? null;
  const showForm = status !== null && (!feed || editing);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>LMS calendar</Text>
      <Text style={styles.panelBody}>
        Paste your Canvas, Brightspace, Moodle or Blackboard calendar feed link. Atlas adds assignments, quizzes and exams to
        the matching courses and keeps their due dates up to date.
      </Text>

      {status === null && !message ? <ActivityIndicator color={theme.colors.teal} style={styles.loading} /> : null}

      {feed ? (
        <View style={styles.feedBox}>
          <Text style={styles.feedTitle}>{LMS_PROVIDER_LABELS[feed.provider]} feed</Text>
          <Text style={styles.feedMeta}>{feed.maskedUrl}</Text>
          <Text style={styles.feedMeta}>
            {lmsLastSyncedLabel(feed.lastSyncedAt, new Date())}
            {feed.counts ? ` · ${feed.counts.deadlines} deadlines in feed` : ""}
          </Text>
          {feed.counts ? <Text style={styles.feedMeta}>Last sync: {lmsSyncSummary(feed.counts)}</Text> : null}
          {feed.lastErrorMessage ? <Text style={styles.errorText}>Last sync failed: {feed.lastErrorMessage}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={syncNow}
              style={({ pressed }) => [styles.primaryButton, (pressed || busy !== null) && styles.buttonPressed]}
            >
              {busy === "sync" ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.primaryText}>Sync now</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => setEditing((value) => !value)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>{editing ? "Keep link" : "Replace link"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy !== null} onPress={confirmDisconnect} style={styles.smallButton}>
              <Text style={[styles.smallButtonText, styles.dangerText]}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.label}>Calendar feed link</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setUrl}
            placeholder="https://yourschool.instructure.com/feeds/…"
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            textContentType="none"
            value={url}
          />
          <Text style={styles.hint}>
            This link works like a password for your LMS calendar. Atlas stores it privately and only uses it to read your
            deadlines.
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null || !url.trim()}
              onPress={connect}
              style={({ pressed }) => [styles.primaryButton, (pressed || busy !== null || !url.trim()) && styles.buttonPressed]}
            >
              {busy === "connect" ? (
                <ActivityIndicator color={theme.colors.surface} />
              ) : (
                <Text style={styles.primaryText}>{feed ? "Use this link" : "Connect"}</Text>
              )}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowHelp((value) => !value)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Where is it?</Text>
            </Pressable>
          </View>
          {showHelp ? (
            <View style={styles.help}>
              {WHERE_TO_FIND.map((line) => (
                <Text key={line} style={styles.hint}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {message ? <Text style={[styles.message, message.tone === "error" && styles.errorText]}>{message.text}</Text> : null}

      {status && status.needsCourse.length > 0 ? (
        <View style={styles.pendingList}>
          <Text style={styles.feedTitle}>
            {status.needsCourse.length} {status.needsCourse.length === 1 ? "deadline needs" : "deadlines need"} a course
          </Text>
          <Text style={styles.hint}>
            Pick a course to add each one, or skip it. Later deadlines with the same course tag follow your choice.
          </Text>
          {status.needsCourse.map((item) => (
            <PendingItemCard
              accessToken={accessToken}
              courses={courses}
              item={item}
              key={item.id}
              onResolved={(next, added) => {
                setStatus((current) => (current ? { ...current, ...next } : next));
                if (added) onDeadlinesChanged();
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PendingItemCard({
  accessToken,
  courses,
  item,
  onResolved,
}: {
  accessToken: string;
  courses: MobileCourseSummary[];
  item: LmsPendingItem;
  onResolved: (status: LmsFeedStatusResponse, added: boolean) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [kind, setKind] = useState<LmsDeadlineKind>(item.kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resolve(action: { action: "assign"; courseId: string; kind: LmsDeadlineKind } | { action: "skip" }) {
    setBusy(true);
    setError("");
    try {
      onResolved(await resolveLmsPendingItem(accessToken, item.id, action), action.action === "assign");
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Unable to update that deadline.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.pendingCard}>
      <Text style={styles.pendingTitle}>{item.title}</Text>
      <Text style={styles.feedMeta}>
        Due {formatDue(item.dueAt)}
        {item.courseHint ? ` · from “${item.courseHint}”` : ""}
      </Text>
      {courses.length === 0 ? (
        <Text style={styles.hint}>Add a course first, then pick it here.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.chipScroll} horizontal showsHorizontalScrollIndicator={false}>
          {courses.map((course) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: courseId === course.id }}
              key={course.id}
              onPress={() => setCourseId(course.id)}
              style={[styles.chip, courseId === course.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, courseId === course.id && styles.chipTextActive]}>{course.code ?? course.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.chipRow}>
        {(Object.keys(KIND_LABELS) as LmsDeadlineKind[]).map((value) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: kind === value }}
            key={value}
            onPress={() => setKind(value)}
            style={[styles.chip, kind === value && styles.chipActive]}
          >
            <Text style={[styles.chipText, kind === value && styles.chipTextActive]}>{KIND_LABELS[value]}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={busy || !courseId}
          onPress={() => courseId && void resolve({ action: "assign", courseId, kind })}
          style={({ pressed }) => [styles.smallButton, (pressed || busy || !courseId) && styles.buttonPressed]}
        >
          <Text style={styles.smallButtonText}>Add to course</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void resolve({ action: "skip" })} style={styles.ghostButton}>
          <Text style={styles.ghostText}>Skip</Text>
        </Pressable>
      </View>
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
      gap: 8,
      padding: 16,
    },
    panelLabel: {
      ...theme.text("title", "ink"),
    },
    panelBody: {
      ...theme.text("body", "inkMuted"),
    },
    loading: {
      alignSelf: "flex-start",
      marginTop: 8,
    },
    feedBox: {
      backgroundColor: colors.surface2,
      borderRadius: 8,
      gap: 4,
      marginTop: 8,
      padding: 12,
    },
    feedTitle: {
      ...theme.text("heading", "ink"),
    },
    feedMeta: {
      ...theme.text("label", "inkMuted"),
    },
    form: {
      gap: 6,
      marginTop: 8,
    },
    label: {
      ...theme.text("label", "ink"),
    },
    input: {
      ...theme.text("body", "ink"),
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    hint: {
      ...theme.text("label", "inkMuted"),
    },
    help: {
      gap: 4,
      marginTop: 4,
    },
    actionRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 44,
      minWidth: 110,
      paddingHorizontal: 14,
    },
    primaryText: {
      ...theme.text("label", "surface"),
    },
    smallButton: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    smallButtonText: {
      ...theme.text("label", "teal"),
    },
    ghostButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    ghostText: {
      ...theme.text("label", "inkMuted"),
    },
    dangerText: {
      color: colors.danger,
    },
    buttonPressed: {
      opacity: 0.6,
    },
    message: {
      ...theme.text("label", "teal"),
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      marginTop: 8,
      padding: 10,
    },
    errorText: {
      ...theme.text("label", "danger"),
    },
    pendingList: {
      gap: 8,
      marginTop: 12,
    },
    pendingCard: {
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 6,
      padding: 12,
    },
    pendingTitle: {
      ...theme.text("body", "ink"),
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    chipScroll: {
      flexDirection: "row",
      gap: 6,
    },
    chip: {
      borderColor: colors.line,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    chipText: {
      ...theme.text("label", "ink"),
    },
    chipTextActive: {
      color: colors.surface,
    },
  });
}
