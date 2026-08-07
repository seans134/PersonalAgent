import { useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          Permanently deletes your account, goals, calendars, plans, meals, workouts, and body-profile data.
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
              {deleting ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.confirmDeleteText}>Yes, Delete My Account</Text>}
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

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  container: { gap: 18, padding: 18, paddingBottom: 32 },
  eyebrow: {
    ...theme.text("monoLabel", "teal"),
  },
  title: {
    ...theme.text("displayXl", "ink"),
  },
  subtitle: {
    ...theme.text("body", "inkMuted"),
    marginTop: 4,
  },
  section: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  sectionTitle: {
    ...theme.text("monoLabel", "inkMuted"),
    padding: 14,
  },
  linkButton: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 14 },
  linkText: {
    ...theme.text("body", "ink"),
  },
  arrow: {
    ...theme.text("displayLg", "inkMuted"),
  },
  dangerSection: { backgroundColor: colors.surface, borderColor: colors.danger, borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  dangerTitle: {
    ...theme.text("heading", "danger"),
  },
  dangerBody: {
    ...theme.text("body", "danger"),
  },
  deleteButton: { alignItems: "center", borderColor: colors.danger, borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: "center" },
  deleteText: {
    ...theme.text("label", "danger"),
  },
  error: {
    ...theme.text("label", "danger"),
    backgroundColor: colors.surface2,
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  modalRoot: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.55)", flex: 1, justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 8, gap: 12, maxWidth: 420, padding: 20, width: "100%" },
  dialogTitle: {
    ...theme.text("title", "ink"),
  },
  dialogBody: {
    ...theme.text("body", "inkMuted"),
  },
  confirmDeleteButton: { alignItems: "center", backgroundColor: colors.danger, borderRadius: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: 12 },
  confirmDeleteText: {
    ...theme.text("label", "surface"),
    textAlign: "center",
  },
  cancelButton: { alignItems: "center", borderColor: colors.line, borderRadius: 8, borderWidth: 1, minHeight: 46, justifyContent: "center" },
  cancelText: {
    ...theme.text("label", "ink"),
  },
  disabled: { opacity: 0.58 },
});
}
