import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  generateMobileTodayPlan,
  type MobileTodayPlanResponse,
} from "../lib/api";
import { readCachedTodayPlan, writeCachedTodayPlan } from "../lib/cache";
import { errorHaptic, successHaptic } from "../lib/haptics";
import { readNotificationPreferences, scheduleTodayPlanReminders } from "../lib/notifications";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { TodayPlanTimeline } from "./TodayPlanTimeline";

type DashboardScreenProps = {
  accessToken: string;
};

const legendKeys = [
  { key: "goal", label: "Goal" },
  { key: "focus", label: "Focus" },
  { key: "fitness", label: "Fitness" },
  { key: "wellness", label: "Wellness" },
  { key: "commit", label: "Fixed" },
] as const;

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardScreen({ accessToken }: DashboardScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  const [plan, setPlan] = useState<MobileTodayPlanResponse | null>(null);
  const [planIsStale, setPlanIsStale] = useState(false);
  const [planCacheMessage, setPlanCacheMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);

  const now = new Date();
  const greeting = greetingFor(now);
  const dateLabel = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const loadCachedPlan = useCallback(async () => {
    const cachedPlan = await readCachedTodayPlan();
    if (!cachedPlan) return;

    const savedAt = new Date(cachedPlan.savedAt);
    const isFromToday = savedAt.toDateString() === new Date().toDateString();

    setPlan(cachedPlan.value);
    setPlanIsStale(!isFromToday);
    setPlanCacheMessage(
      isFromToday
        ? `Saved plan from ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : `This plan is from ${savedAt.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}. Pull down to generate a fresh plan for today.`,
    );
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCachedPlan();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCachedPlan]);

  const generatePlan = useCallback(async () => {
    setError(undefined);
    setNotice(undefined);

    try {
      const nextPlan = await generateMobileTodayPlan(accessToken);
      setPlan(nextPlan);
      setPlanIsStale(false);
      setPlanCacheMessage("Saved for offline viewing.");
      successHaptic();
      await writeCachedTodayPlan(nextPlan);
    } catch (generateError) {
      errorHaptic();
      setError(generateError instanceof Error ? generateError.message : "Unable to generate today plan.");
    }
  }, [accessToken]);

  async function handleGeneratePress() {
    setGeneratingPlan(true);
    await generatePlan();
    setGeneratingPlan(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await generatePlan();
    setRefreshing(false);
  }

  async function scheduleReminders() {
    setError(undefined);
    setNotice(undefined);

    if (planIsStale) {
      setNotice("This plan is from a previous day. Pull down to generate a fresh plan first.");
      return;
    }

    setSchedulingReminder(true);

    try {
      const preferences = await readNotificationPreferences();
      const count = await scheduleTodayPlanReminders(plan?.plan.items ?? [], preferences.planLeadMinutes);
      setNotice(
        count > 0
          ? `${count} reminder${count === 1 ? "" : "s"} scheduled for today's remaining plan.`
          : "No future plan items are available to remind you about.",
      );
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : "Unable to schedule reminder.");
    }

    setSchedulingReminder(false);
  }

  const hasPlanContent =
    plan !== null && (plan.plan.items.length > 0 || plan.contextEvents.length > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.teal}
          colors={[colors.teal]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={theme.text("monoLabel", "teal")}>{dateLabel}</Text>
        <Text style={theme.text("displayXl", "ink")}>{greeting}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={theme.text("body", "danger")}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={theme.text("label", "teal")}>{notice}</Text>
        </View>
      ) : null}

      {!plan ? (
        <View style={[styles.card, styles.heroCard]}>
          <Text style={theme.text("title", "ink")}>Plan your day</Text>
          <Text style={[theme.text("body", "inkMuted"), styles.heroBody]}>
            Atlas charts a route through your day from your goals, preferences, and calendar.
          </Text>
          <Pressable
            disabled={generatingPlan}
            onPress={handleGeneratePress}
            style={({ pressed }) => [styles.primaryButton, (pressed || generatingPlan) && styles.pressed]}
          >
            {generatingPlan ? (
              <ActivityIndicator color={colors.onTeal} />
            ) : (
              <Text style={theme.text("heading", "onTeal")}>Generate today</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {plan ? (
        <View style={styles.planSection}>
          <View style={styles.statRow}>
            <StatTile theme={theme} styles={styles} label="Moves" value={plan.plan.items.length} />
            <StatTile theme={theme} styles={styles} label="Goals used" value={plan.meta.goalsCount} />
            <StatTile theme={theme} styles={styles} label="Events" value={plan.meta.eventsCount} />
          </View>

          {planCacheMessage ? (
            <Text style={[theme.text("label", "teal"), planIsStale && styles.cacheMessageStale]}>
              {planCacheMessage}
            </Text>
          ) : null}

          {plan.summary ? (
            <View style={styles.summaryCard}>
              <Text style={theme.text("body", "ink")}>{plan.summary}</Text>
            </View>
          ) : null}
          {plan.plan.explanation ? (
            <Text style={theme.text("body", "inkMuted")}>{plan.plan.explanation}</Text>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={theme.text("title", "ink")}>Your day</Text>
            <View style={styles.legendRow}>
              {legendKeys.map((entry) => (
                <View key={entry.key} style={styles.legendItem}>
                  <View style={[styles.legendNode, { backgroundColor: colors[entry.key] }]} />
                  <Text style={theme.text("monoTime", "inkMuted")}>{entry.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {hasPlanContent ? (
            <TodayPlanTimeline contextEvents={plan.contextEvents} items={plan.plan.items} />
          ) : (
            <View style={[styles.card, styles.emptyDay]}>
              <Text style={theme.text("body", "inkMuted")}>No plan items for today yet. Generate a plan to chart your route.</Text>
            </View>
          )}

          {plan.meta.warnings.length > 0 ? (
            <View style={styles.warningCard}>
              {plan.meta.warnings.map((warning) => (
                <Text key={warning} style={theme.text("body", "warning")}>
                  {warning}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              disabled={generatingPlan}
              onPress={handleGeneratePress}
              style={({ pressed }) => [styles.secondaryAction, (pressed || generatingPlan) && styles.pressed]}
            >
              {generatingPlan ? (
                <ActivityIndicator color={colors.teal} />
              ) : (
                <Text style={theme.text("heading", "teal")}>Regenerate</Text>
              )}
            </Pressable>
            <Pressable
              disabled={schedulingReminder}
              onPress={scheduleReminders}
              style={({ pressed }) => [styles.primaryButton, styles.actionFlex, (pressed || schedulingReminder) && styles.pressed]}
            >
              {schedulingReminder ? (
                <ActivityIndicator color={colors.onTeal} />
              ) : (
                <Text style={theme.text("heading", "onTeal")}>Schedule reminders</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  theme,
  styles,
}: {
  label: string;
  value: number;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={theme.text("displayLg", "teal")}>{value}</Text>
      <Text style={theme.text("monoLabel", "inkMuted")}>{label}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius, shadow } = theme;
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.paper,
    },
    content: {
      gap: space.base,
      padding: space.lg,
      paddingBottom: space["4xl"],
    },
    header: {
      gap: space.xs,
      paddingTop: space.xs,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      padding: space.lg,
      ...shadow.sm,
    },
    heroCard: {
      gap: space.md,
    },
    heroBody: {
      marginBottom: space.xs,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: space.base,
    },
    pressed: {
      opacity: 0.82,
    },
    errorBanner: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      padding: space.md,
    },
    noticeBanner: {
      backgroundColor: colors.surface,
      borderColor: colors.teal,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      padding: space.md,
    },
    planSection: {
      gap: space.md,
    },
    statRow: {
      flexDirection: "row",
      gap: space.sm,
    },
    statTile: {
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      flex: 1,
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      ...shadow.sm,
    },
    cacheMessageStale: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
      borderRadius: radius.control,
      borderWidth: 1,
      color: colors.warning,
      overflow: "hidden",
      padding: space.sm,
    },
    summaryCard: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderLeftColor: colors.teal,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: space.md,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
      justifyContent: "space-between",
      marginTop: space.xs2,
    },
    legendRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.md,
    },
    legendItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    legendNode: {
      borderRadius: 2,
      height: 9,
      width: 9,
      transform: [{ rotate: "45deg" }],
    },
    emptyDay: {
      alignItems: "center",
    },
    warningCard: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      gap: space.xs,
      padding: space.md,
    },
    actionRow: {
      flexDirection: "row",
      gap: space.sm,
      marginTop: space.xs2,
    },
    secondaryAction: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: space.lg,
    },
    actionFlex: {
      flex: 1,
    },
  });
}
