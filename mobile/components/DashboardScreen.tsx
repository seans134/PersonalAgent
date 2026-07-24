import { useCallback, useEffect, useState } from "react";
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
import { TodayPlanTimeline } from "./TodayPlanTimeline";

type DashboardScreenProps = {
  accessToken: string;
};

const legend = [
  { color: "#0369a1", label: "Plan" },
  { color: "#7c2d12", label: "Recurring" },
  { color: "#57534e", label: "Event" },
];

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function DashboardScreen({ accessToken }: DashboardScreenProps) {
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
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#0f766e"
          colors={["#0f766e"]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{dateLabel}</Text>
        <Text style={styles.title}>{greeting}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {!plan ? (
        <View style={[styles.card, styles.heroCard]}>
          <Text style={styles.heroTitle}>Plan your day</Text>
          <Text style={styles.heroBody}>
            Atlas builds a schedule from your goals, preferences, and calendar.
          </Text>
          <Pressable
            disabled={generatingPlan}
            onPress={handleGeneratePress}
            style={({ pressed }) => [styles.primaryButton, (pressed || generatingPlan) && styles.buttonPressed]}
          >
            {generatingPlan ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryText}>Generate Today Plan</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {plan ? (
        <View style={styles.planSection}>
          <View style={styles.statRow}>
            <StatTile label="Plan blocks" value={plan.plan.items.length} />
            <StatTile label="Goals used" value={plan.meta.goalsCount} />
            <StatTile label="Events" value={plan.meta.eventsCount} />
          </View>

          {planCacheMessage ? (
            <Text style={[styles.cacheMessage, planIsStale && styles.cacheMessageStale]}>
              {planCacheMessage}
            </Text>
          ) : null}

          {plan.summary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{plan.summary}</Text>
            </View>
          ) : null}
          {plan.plan.explanation ? (
            <Text style={styles.explanation}>{plan.plan.explanation}</Text>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your day</Text>
            <View style={styles.legendRow}>
              {legend.map((entry) => (
                <View key={entry.label} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: entry.color }]} />
                  <Text style={styles.legendText}>{entry.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {hasPlanContent ? (
            <TodayPlanTimeline contextEvents={plan.contextEvents} items={plan.plan.items} />
          ) : (
            <View style={[styles.card, styles.emptyDay]}>
              <Text style={styles.emptyBody}>No plan items for today.</Text>
            </View>
          )}

          {plan.meta.warnings.length > 0 ? (
            <View style={styles.warningCard}>
              {plan.meta.warnings.map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  {warning}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              disabled={generatingPlan}
              onPress={handleGeneratePress}
              style={({ pressed }) => [styles.secondaryAction, (pressed || generatingPlan) && styles.buttonPressed]}
            >
              {generatingPlan ? (
                <ActivityIndicator color="#0f766e" />
              ) : (
                <Text style={styles.secondaryActionText}>Regenerate</Text>
              )}
            </Pressable>
            <Pressable
              disabled={schedulingReminder}
              onPress={scheduleReminders}
              style={({ pressed }) => [styles.primaryButton, styles.actionFlex, (pressed || schedulingReminder) && styles.buttonPressed]}
            >
              {schedulingReminder ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>Schedule Reminders</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const cardShadow = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 44,
  },
  header: {
    gap: 4,
    paddingTop: 4,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e6edf3",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    ...cardShadow,
  },
  heroCard: {
    gap: 10,
  },
  heroTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800",
  },
  heroBody: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.82,
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  noticeBanner: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noticeText: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  planSection: {
    gap: 14,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e6edf3",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...cardShadow,
  },
  statValue: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "800",
  },
  statLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  cacheMessage: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  cacheMessageStale: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
    borderRadius: 12,
    borderWidth: 1,
    color: "#92400e",
    overflow: "hidden",
    padding: 10,
  },
  summaryCard: {
    backgroundColor: "#ecfdf5",
    borderColor: "#99f6e4",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  summaryText: {
    color: "#134e4a",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  explanation: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  legendSwatch: {
    borderRadius: 3,
    height: 11,
    width: 11,
  },
  legendText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyDay: {
    alignItems: "center",
  },
  emptyBody: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  warningText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#0f766e",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryActionText: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "800",
  },
  actionFlex: {
    flex: 1,
  },
});
