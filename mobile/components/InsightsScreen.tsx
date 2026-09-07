import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { SegmentedTabs } from "./MobileAppShell";
import { fetchMobileInsights, type HabitPeriod, type MobileHabitReport } from "../lib/api";

type InsightsScreenProps = {
  accessToken: string;
};

function deviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatValue(value: number | null, suffix = "") {
  return value === null ? "—" : `${Number(value).toLocaleString()}${suffix}`;
}

export function InsightsScreen({ accessToken }: InsightsScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [period, setPeriod] = useState<HabitPeriod>("daily");
  const [reports, setReports] = useState<Partial<Record<HabitPeriod, MobileHabitReport>>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const load = useCallback(
    async (target: HabitPeriod, refresh = false) => {
      setLoading(true);
      setMessage(undefined);
      try {
        const result = await fetchMobileInsights(accessToken, target, {
          referenceDate: localDate(),
          timezone: deviceTimezone(),
          refresh,
        });
        setReports((current) => ({ ...current, [target]: result.report }));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load insights.");
      }
      setLoading(false);
    },
    [accessToken],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!reports[period]) {
        void load(period);
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [load, period, reports]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(period, true);
    setRefreshing(false);
  }

  const report = reports[period];

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.paper }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.teal} />}
    >
      <SegmentedTabs<HabitPeriod>
        value={period}
        onChange={setPeriod}
        options={[
          { value: "daily", label: "Daily digest" },
          { value: "weekly", label: "Weekly review" },
        ]}
      />

      {message ? <Text style={[theme.text("body", "danger"), styles.message]}>{message}</Text> : null}

      {!report && loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.teal} />
          <Text style={theme.text("body", "inkMuted")}>Analyzing your habits…</Text>
        </View>
      ) : null}

      {report ? <ReportView report={report} theme={theme} styles={styles} /> : null}

      {report ? (
        <Pressable onPress={() => void load(period, true)} disabled={loading} style={styles.regenerate}>
          <Text style={theme.text("label", "inkMuted")}>{loading ? "Working…" : "Regenerate"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function ReportView({
  report,
  theme,
  styles,
}: {
  report: MobileHabitReport;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { digest, metrics } = report;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Logging streak", value: `${metrics.streaks.loggingStreak}d` },
    { label: "Workout streak", value: `${metrics.streaks.workoutStreak}d` },
    { label: "Days logged", value: `${metrics.nutrition.daysLogged}/${metrics.range.days}` },
    { label: "Workouts", value: String(metrics.workouts.sessions) },
    { label: "Avg calories", value: formatValue(metrics.nutrition.avgCalories) },
    { label: "Avg protein", value: formatValue(metrics.nutrition.avgProtein, "g") },
  ];

  return (
    <View style={styles.reportBody}>
      <View style={styles.card}>
        <Text style={theme.text("title", "ink")}>{digest.headline}</Text>
        <Text style={[theme.text("body", "inkMuted"), styles.summary]}>{digest.summary}</Text>

        {digest.endorsements.length > 0 ? (
          <View style={styles.section}>
            <Text style={theme.text("monoLabel", "inkMuted")}>Going well</Text>
            {digest.endorsements.map((endorsement, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={[theme.text("body", "success"), styles.bullet]}>✓</Text>
                <Text style={[theme.text("body", "ink"), styles.itemText]}>{endorsement}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {digest.improvements.length > 0 ? (
          <View style={styles.section}>
            <Text style={theme.text("monoLabel", "inkMuted")}>Worth a look</Text>
            {digest.improvements.map((improvement, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={[theme.text("body", "warning"), styles.bullet]}>→</Text>
                <Text style={[theme.text("body", "ink"), styles.itemText]}>
                  <Text style={theme.text("label", "warning")}>{improvement.area}: </Text>
                  {improvement.suggestion}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.statGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={theme.text("monoLabel", "inkMuted")}>{stat.label}</Text>
            <Text style={theme.text("displayLg", "ink")}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    content: {
      gap: space.base,
      padding: space.lg,
      paddingBottom: space["3xl"],
    },
    message: {
      paddingHorizontal: space.xs,
    },
    loading: {
      alignItems: "center",
      gap: space.sm,
      paddingVertical: space.xl,
    },
    reportBody: {
      gap: space.base,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      gap: space.sm,
      padding: space.base,
    },
    summary: {
      marginTop: space.xs2,
    },
    section: {
      gap: space.xs,
      marginTop: space.xs,
    },
    itemRow: {
      flexDirection: "row",
      gap: space.xs,
    },
    bullet: {
      width: 16,
    },
    itemText: {
      flex: 1,
    },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
    },
    statCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      flexBasis: "47%",
      flexGrow: 1,
      gap: space.xs2,
      padding: space.base,
    },
    regenerate: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
    },
  });
}
