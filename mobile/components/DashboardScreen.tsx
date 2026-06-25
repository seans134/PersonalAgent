import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchBackendSession,
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
  const [backendMessage, setBackendMessage] = useState("Not checked yet.");
  const [plan, setPlan] = useState<MobileTodayPlanResponse | null>(null);
  const [planCacheMessage, setPlanCacheMessage] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);

  const loadCachedPlan = useCallback(async () => {
    const cachedPlan = await readCachedTodayPlan();

    if (cachedPlan) {
      setPlan(cachedPlan.value);
      setPlanCacheMessage(`Showing saved plan from ${new Date(cachedPlan.savedAt).toLocaleString()}.`);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCachedPlan();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCachedPlan]);

  async function checkBackendSession() {
    setCheckingBackend(true);
    const result = await fetchBackendSession(accessToken);
    setBackendMessage(
      result.ok
        ? `Backend accepted session for ${result.user.email ?? result.user.id}.`
        : `Backend rejected session: ${result.error}`,
    );
    setCheckingBackend(false);
  }

  async function generatePlan() {
    setMessage(undefined);
    setGeneratingPlan(true);

    try {
      const nextPlan = await generateMobileTodayPlan(accessToken);
      setPlan(nextPlan);
      setPlanCacheMessage("Saved for offline viewing.");
      await writeCachedTodayPlan(nextPlan);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate today plan.");
    }

    setGeneratingPlan(false);
  }

  async function scheduleReminders() {
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
    <ScrollView contentContainerStyle={styles.content}>
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
          onPress={generatePlan}
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

      {plan ? (
        <View style={styles.planSection}>
          {planCacheMessage ? <Text style={styles.cacheMessage}>{planCacheMessage}</Text> : null}
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

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Backend auth probe</Text>
        <Text style={styles.panelBody}>{backendMessage}</Text>
        <Pressable
          disabled={checkingBackend}
          onPress={checkBackendSession}
          style={({ pressed }) => [styles.secondaryAction, (pressed || checkingBackend) && styles.buttonPressed]}
        >
          {checkingBackend ? (
            <ActivityIndicator color="#0f766e" />
          ) : (
            <Text style={styles.secondaryActionText}>Check Backend Session</Text>
          )}
        </Pressable>
      </View>

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
