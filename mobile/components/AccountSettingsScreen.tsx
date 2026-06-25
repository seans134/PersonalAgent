import { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { deleteMobileAccount } from "../lib/api";
import { resetAnalyticsUser } from "../lib/analytics";
import { getMobileEnv } from "../lib/env";
import { cancelAllAtlasNotifications } from "../lib/notifications";
import { supabase } from "../lib/supabase";

type AccountSettingsScreenProps = {
  accessToken: string;
  onAccountDeleted: () => void;
};

export function AccountSettingsScreen({ accessToken, onAccountDeleted }: AccountSettingsScreenProps) {
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const env = getMobileEnv();
  const websiteBaseUrl = (env.websiteUrl ?? env.apiBaseUrl ?? "").replace(/\/$/, "");

  async function openPublicPage(path: string) {
    setError(null);
    if (!websiteBaseUrl) {
      setError("The production website URL is not configured.");
      return;
    }

    try {
      await Linking.openURL(`${websiteBaseUrl}${path}`);
    } catch {
      setError("Unable to open that page.");
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);

    try {
      await deleteMobileAccount(accessToken);
      await Promise.allSettled([
        cancelAllAtlasNotifications(),
        supabase.auth.signOut({ scope: "local" }),
      ]);
      resetAnalyticsUser();
      setConfirmingDeletion(false);
      onAccountDeleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to delete account.");
      setDeleting(false);
      setConfirmingDeletion(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.eyebrow}>Account</Text>
        <Text style={styles.title}>Settings &amp; Legal</Text>
        <Text style={styles.subtitle}>Review Atlas policies, get support, or permanently remove your account.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Information</Text>
        <Pressable onPress={() => openPublicPage("/privacy")} style={styles.linkButton}>
          <Text style={styles.linkText}>Privacy Policy</Text><Text style={styles.arrow}>{">"}</Text>
        </Pressable>
        <Pressable onPress={() => openPublicPage("/terms")} style={styles.linkButton}>
          <Text style={styles.linkText}>Terms of Use</Text><Text style={styles.arrow}>{">"}</Text>
        </Pressable>
        <Pressable onPress={() => openPublicPage("/support")} style={styles.linkButton}>
          <Text style={styles.linkText}>Support</Text><Text style={styles.arrow}>{">"}</Text>
        </Pressable>
      </View>

      <View style={styles.dangerSection}>
        <Text style={styles.dangerTitle}>Delete account</Text>
        <Text style={styles.dangerBody}>
          Permanently deletes your account, goals, calendars, plans, meals, workouts, body-profile data, and stored Google Calendar authorization.
        </Text>
        <Pressable onPress={() => setConfirmingDeletion(true)} style={styles.deleteButton}>
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>
      </View>

      <Modal animationType="fade" onRequestClose={() => !deleting && setConfirmingDeletion(false)} transparent visible={confirmingDeletion}>
        <View style={styles.modalRoot}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Permanently delete account?</Text>
            <Text style={styles.dialogBody}>This cannot be undone. Your Atlas account and associated app data will be deleted immediately.</Text>
            <Pressable disabled={deleting} onPress={deleteAccount} style={[styles.confirmDeleteButton, deleting && styles.disabled]}>
              {deleting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.confirmDeleteText}>Yes, Delete My Account</Text>}
            </Pressable>
            <Pressable disabled={deleting} onPress={() => setConfirmingDeletion(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18, padding: 18, paddingBottom: 32 },
  eyebrow: { color: "#0f766e", fontSize: 12, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" },
  title: { color: "#111827", fontSize: 30, fontWeight: "800", lineHeight: 36 },
  subtitle: { color: "#475569", fontSize: 15, lineHeight: 21, marginTop: 4 },
  section: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  sectionTitle: { color: "#64748b", fontSize: 12, fontWeight: "800", padding: 14, textTransform: "uppercase" },
  linkButton: { alignItems: "center", borderTopColor: "#e2e8f0", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 14 },
  linkText: { color: "#111827", fontSize: 15, fontWeight: "700" },
  arrow: { color: "#64748b", fontSize: 24 },
  dangerSection: { backgroundColor: "#ffffff", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  dangerTitle: { color: "#991b1b", fontSize: 17, fontWeight: "800" },
  dangerBody: { color: "#7f1d1d", fontSize: 14, lineHeight: 20 },
  deleteButton: { alignItems: "center", borderColor: "#dc2626", borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: "center" },
  deleteText: { color: "#b91c1c", fontSize: 14, fontWeight: "800" },
  error: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, color: "#b91c1c", fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 12 },
  modalRoot: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.55)", flex: 1, justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: "#ffffff", borderRadius: 8, gap: 12, maxWidth: 420, padding: 20, width: "100%" },
  dialogTitle: { color: "#111827", fontSize: 20, fontWeight: "800" },
  dialogBody: { color: "#475569", fontSize: 14, lineHeight: 21 },
  confirmDeleteButton: { alignItems: "center", backgroundColor: "#b91c1c", borderRadius: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  confirmDeleteText: { color: "#ffffff", fontSize: 14, fontWeight: "800", textAlign: "center" },
  cancelButton: { alignItems: "center", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: "center" },
  cancelText: { color: "#334155", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.58 },
});
