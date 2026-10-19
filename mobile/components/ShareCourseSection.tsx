import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { createMobileCourseShare, fetchMobileCourseShare, stopMobileCourseShare, type MobileCourseShare } from "../lib/api";
import { useTheme, type Theme } from "../lib/theme";

/** "Share with classmates" on the course detail: one link per course, sent through the native share sheet. */
export function ShareCourseSection({
  accessToken,
  courseId,
  courseName,
  archived,
}: {
  accessToken: string;
  courseId: string;
  courseName: string;
  archived: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [share, setShare] = useState<MobileCourseShare | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    fetchMobileCourseShare(accessToken, courseId)
      .then((result) => {
        if (!cancelled) setShare(result.share);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, courseId]);

  async function openShareSheet(link: MobileCourseShare) {
    try {
      await Share.share({ message: `Add ${courseName} to Atlas: ${link.url}` });
    } catch {
      // Dismissed or unavailable; the link stays on screen.
    }
  }

  async function startSharing() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await createMobileCourseShare(accessToken, courseId);
      setShare(result.share);
      setBusy(false);
      await openShareSheet(result.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to share course.");
      setBusy(false);
    }
  }

  function stopSharing() {
    Alert.alert("Stop sharing?", "The link stops working. Classmates who already added the course keep it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            setError(undefined);
            try {
              await stopMobileCourseShare(accessToken, courseId);
              setShare(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to stop sharing.");
            }
            setBusy(false);
          })();
        },
      },
    ]);
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Share with classmates</Text>
      <Text style={styles.body}>
        {"Classmates get this course's dates and grade weights in one tap. Your grades and notes aren't shared."}
      </Text>

      {!loaded ? (
        <ActivityIndicator color={theme.colors.teal} />
      ) : share ? (
        <>
          <Text selectable style={styles.link}>
            {share.url}
          </Text>
          <Text style={styles.count}>
            {share.joinedCount === 1 ? "1 classmate joined" : `${share.joinedCount} classmates joined`}
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              disabled={busy}
              onPress={() => void openShareSheet(share)}
              style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}
            >
              <Text style={styles.primaryText}>Share link</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={stopSharing}
              style={({ pressed }) => [styles.secondaryButton, (pressed || busy) && styles.pressed]}
            >
              <Text style={styles.dangerText}>Stop sharing</Text>
            </Pressable>
          </View>
        </>
      ) : archived ? (
        <Text style={styles.body}>Restore this course to share it.</Text>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() => void startSharing()}
          style={({ pressed }) => [styles.primaryButton, (pressed || busy) && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.primaryText}>Share with classmates</Text>}
        </Pressable>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
    label: {
      ...theme.text("title", "ink"),
    },
    body: {
      ...theme.text("body", "inkMuted"),
    },
    link: {
      ...theme.text("monoTime", "ink"),
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    count: {
      ...theme.text("body", "ink"),
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    primaryButton: {
      alignItems: "center",
      alignSelf: "flex-start",
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
      minHeight: 48,
      paddingHorizontal: 12,
    },
    dangerText: {
      ...theme.text("label", "danger"),
    },
    pressed: {
      opacity: 0.78,
    },
    errorText: {
      ...theme.text("label", "danger"),
    },
  });
}
