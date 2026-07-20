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
import { readNotificationPreferences, scheduleTodayPlanReminders } from "../lib/notifications";

type DashboardScreenProps = {
  accessToken: string;
  email?: string | null;
};

export function DashboardScreen({
  accessToken,
  email,
}: DashboardScreenProps) {
  const [plan, setPlan] = useState<MobileTodayPlanResponse | null>(null);
  const [planIsStale, setPlanIsStale] = useState(false);
  const [planCacheMessage, setPlanCacheMessage] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);

  const loadCachedPlan = useCallback(async () => {
    const cachedPlan = await readCachedTodayPlan();
    if (!cachedPlan) return;

    const savedAt = new Date(cachedPlan.savedAt);
    const isFromToday = savedAt.toDateString() === new Date().toDateString();

    setPlan(cachedPlan.value);
    setPlanIsStale(!isFromToday);
    setPlanCacheMessage(
      isFromToday
        ? `Showing saved plan from ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
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
    setMessage(undefined);

    try {
      const nextPlan = await generateMobileTodayPlan(accessToken);
      setPlan(nextPlan);
      setPlanIsStale(false);
      setPlanCacheMessage("Saved for offline viewing.");
      await writeCachedTodayPlan(nextPlan);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate today plan.");
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
    if (planIsStale) {
      setMessage("This plan is from a previous day. Pull down to generate a fresh plan first.");
      return;
    }

    setMessage(undefined);
    setSchedulingReminder(true);

    try {
      const preferences = await readNotificationPreferences();
      const count = await scheduleTodayPlanReminders(plan?.plan.items ?? [], preferences.planLeadMinutes);
      setMessage(
        count > 0
          ? `${count} reminder${count === 1 ? "" : "s"} scheduled for today's remaining plan.`
          : "No future plan items are available to remind you about.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to schedule reminder.");
    }

    setSchedulingReminder(false);
  }

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
        <Text style={styles.eyebrow}>Atlas</Text>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.body}>Signed in as {email ?? "Atlas user"}.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>{"Today's Plan"}</Text>
        <Text style={styles.panelBody}>
          Generate actions from your goals, preferences, and schedule.
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

      {message ? <Text style={styles.error}>{message}</Text> : null}

      {!plan && !generatingPlan ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>
            Tap Generate Today Plan and Atlas builds a schedule from your goals,
            calendar, and preferences. Pull down to refresh anytime.
          </Text>
        </View>
      ) : null}

      {plan ? (
        <View style={styles.planSection}>
          {planCacheMessage ? (
            <Text style={[styles.cacheMessage, planIsStale && styles.cacheMessageStale]}>
              {planCacheMessage}
            </Text>
          ) : null}
          {plan.summary ? <Text style={styles.summary}>{plan.summary}</Text> : null}
          {plan.plan.explanation ? <Text style={styles.summary}>{plan.plan.explanation}</Text> : null}

          {plan.plan.items.map((item, index) => (
            <View key={`${item.startTime}-${item.title}-${index}`} style={styles.planCard}>
              <Text style={styles.time}>
                {item.startTime} - {item.endTime}
              </Text>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemReason}>{item.reason}</Text>
            </View>
          ))}

          <Text style={styles.meta}>
            Goals used: {plan.meta.goalsCount} | Events considered: {plan.meta.eventsCount}
          </Text>
          {plan.meta.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}

          <Pressable
            disabled={schedulingReminder}
            onPress={scheduleReminders}
            style={({ pressed }) => [styles.secondaryAction, (pressed || schedulingReminder) && styles.buttonPressed]}
          >
            {schedulingReminder ? (
              <ActivityIndicator color="#0f766e" />
            ) : (
              <Text style={styles.secondaryActionText}>{"Schedule Today's Reminders"}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
  },
  body: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  panelLabel: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  panelBody: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    marginTop: 8,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#0f766e",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryActionText: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "800",
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  emptyBody: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  planSection: {
    gap: 12,
  },
  summary: {
    backgroundColor: "#ecfdf5",
    borderColor: "#99f6e4",
    borderRadius: 8,
    borderWidth: 1,
    color: "#134e4a",
    fontSize: 15,
    lineHeight: 22,
    padding: 12,
  },
  cacheMessage: {
    backgroundColor: "#f0fdfa",
    borderColor: "#99f6e4",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    padding: 10,
  },
  cacheMessageStale: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
    color: "#92400e",
  },
  planCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  time: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
  },
  itemTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  itemReason: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  meta: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  warning: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 19,
  },
});
