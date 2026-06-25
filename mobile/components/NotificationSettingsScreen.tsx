import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { fetchMobileWorkoutPlan } from "../lib/api";
import {
  cancelAllAtlasNotifications,
  defaultNotificationPreferences,
  getAtlasScheduledNotificationCount,
  readNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "../lib/notifications";

type NotificationSettingsScreenProps = {
  accessToken: string;
};

export function NotificationSettingsScreen({ accessToken }: NotificationSettingsScreenProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [leadMinutes, setLeadMinutes] = useState(String(defaultNotificationPreferences.planLeadMinutes));
  const [scheduledCount, setScheduledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const [storedPreferences, count] = await Promise.all([
      readNotificationPreferences(),
      getAtlasScheduledNotificationCount(),
    ]);
    setPreferences(storedPreferences);
    setLeadMinutes(String(storedPreferences.planLeadMinutes));
    setScheduledCount(count);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const workoutPlan = await fetchMobileWorkoutPlan(accessToken);
      const nextPreferences = { ...preferences, planLeadMinutes: Number(leadMinutes) };
      const count = await saveNotificationPreferences(nextPreferences, workoutPlan.scheduleItems);
      setPreferences(nextPreferences);
      setScheduledCount(count);
      setMessage(`Saved. ${count} recurring reminder${count === 1 ? "" : "s"} scheduled.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save notification settings.");
    } finally {
      setSaving(false);
    }
  }

  async function disableAll() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await cancelAllAtlasNotifications();
      setPreferences(defaultNotificationPreferences);
      setLeadMinutes(String(defaultNotificationPreferences.planLeadMinutes));
      setScheduledCount(0);
      setMessage("All Atlas reminders are disabled.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to disable reminders.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.eyebrow}>Preferences</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Choose when Atlas should prompt you. Times use your device timezone.</Text>
      </View>

      {loading ? <ActivityIndicator color="#0f766e" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.panel}>
        <View style={styles.settingHeader}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Daily plan prompt</Text>
            <Text style={styles.settingBody}>{"A recurring reminder to generate or review today's plan."}</Text>
          </View>
          <Switch
            onValueChange={(dailyPlanEnabled) => setPreferences((current) => ({ ...current, dailyPlanEnabled }))}
            trackColor={{ false: "#cbd5e1", true: "#5eead4" }}
            thumbColor={preferences.dailyPlanEnabled ? "#0f766e" : "#f8fafc"}
            value={preferences.dailyPlanEnabled}
          />
        </View>
        <TextInput
          autoCapitalize="none"
          editable={preferences.dailyPlanEnabled}
          onChangeText={(dailyPlanTime) => setPreferences((current) => ({ ...current, dailyPlanTime }))}
          placeholder="08:00"
          placeholderTextColor="#94a3b8"
          style={[styles.input, !preferences.dailyPlanEnabled && styles.disabledInput]}
          value={preferences.dailyPlanTime}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.settingHeader}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Workout-day prompt</Text>
            <Text style={styles.settingBody}>Scheduled only on days in your weekly workout plan.</Text>
          </View>
          <Switch
            onValueChange={(workoutEnabled) => setPreferences((current) => ({ ...current, workoutEnabled }))}
            trackColor={{ false: "#cbd5e1", true: "#5eead4" }}
            thumbColor={preferences.workoutEnabled ? "#0f766e" : "#f8fafc"}
            value={preferences.workoutEnabled}
          />
        </View>
        <TextInput
          autoCapitalize="none"
          editable={preferences.workoutEnabled}
          onChangeText={(workoutTime) => setPreferences((current) => ({ ...current, workoutTime }))}
          placeholder="17:00"
          placeholderTextColor="#94a3b8"
          style={[styles.input, !preferences.workoutEnabled && styles.disabledInput]}
          value={preferences.workoutTime}
        />
      </View>

      <View style={styles.panel}>
        <Text style={styles.settingTitle}>{"Today's plan lead time"}</Text>
        <Text style={styles.settingBody}>Minutes before each future plan item. Choose 0 to 120.</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setLeadMinutes}
          placeholder="10"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={leadMinutes}
        />
      </View>

      <Text style={styles.count}>{scheduledCount} Atlas reminders currently scheduled.</Text>

      <Pressable disabled={saving} onPress={saveSettings} style={[styles.primaryButton, saving && styles.disabled]}>
        <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Notification Settings"}</Text>
      </Pressable>
      <Pressable disabled={saving} onPress={disableAll} style={[styles.removeButton, saving && styles.disabled]}>
        <Text style={styles.removeText}>Disable All Reminders</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 18, paddingBottom: 32 },
  eyebrow: { color: "#0f766e", fontSize: 12, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" },
  title: { color: "#111827", fontSize: 30, fontWeight: "800", lineHeight: 36 },
  subtitle: { color: "#475569", fontSize: 15, lineHeight: 21, marginTop: 4 },
  panel: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  settingHeader: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  settingCopy: { flex: 1 },
  settingTitle: { color: "#111827", fontSize: 16, fontWeight: "800" },
  settingBody: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: 4 },
  input: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, color: "#111827", fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  disabledInput: { opacity: 0.5 },
  count: { color: "#475569", fontSize: 13, fontWeight: "700" },
  primaryButton: { alignItems: "center", backgroundColor: "#0f766e", borderRadius: 8, minHeight: 50, justifyContent: "center", paddingHorizontal: 14 },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "800", textAlign: "center" },
  removeButton: { alignItems: "center", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  removeText: { color: "#b91c1c", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.58 },
  error: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, color: "#b91c1c", fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 12 },
  success: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderRadius: 8, borderWidth: 1, color: "#047857", fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 12 },
});
