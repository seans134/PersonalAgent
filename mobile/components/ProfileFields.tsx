import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { defaultAtlasProfile, GPA_SCALE_IDS, GPA_SCALES, type AtlasProfile, type AtlasProfileResponse } from "@personal-agent/core";
import { accountScheduleRequest } from "../lib/account-schedule-api";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { resetAtlasNotifications } from "../lib/notifications";
import { resetAnalyticsUser } from "../lib/analytics";
export function ProfileFields({ accessToken, onAccountDeleted }: { accessToken: string; onAccountDeleted: () => void }) {
  const theme = useTheme(); const [profile, setProfile] = useState<AtlasProfile>(defaultAtlasProfile);
  const [email, setEmail] = useState(""); const [newEmail, setNewEmail] = useState(""); const [password, setPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => { void accountScheduleRequest<AtlasProfileResponse>(accessToken, "/api/mobile/profile").then((data) => { setProfile(data.profile); setEmail(data.email); setLoaded(true); if (data.pendingEmail) setMessage("Email change awaiting confirmation."); }).catch((e) => setError(e.message)); }, [accessToken]);
  async function action(path: string, body: unknown, method = "POST") {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { const data = await accountScheduleRequest<{ message?: string; deleted?: boolean }>(accessToken, path, { method, body }); setMessage(data.message || "Profile saved."); setPassword(""); setNewPassword(""); setConfirmPassword(""); if (data.deleted) { await Promise.allSettled([supabase.auth.signOut(), resetAtlasNotifications()]); resetAnalyticsUser(); onAccountDeleted(); } }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save changes."); } finally { setBusy(false); }
  }
  const border = { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 8, padding: 10 };
  function field(label: string, value: string, onChangeText: (v: string) => void, secure = false) { return <View style={{ gap: 4 }}><Text style={theme.text("body", "ink")}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" secureTextEntry={secure} editable={!busy && loaded} style={[border, theme.text("body", "ink")]} value={value} onChangeText={onChangeText} /></View>; }
  function button(label: string, onPress: () => void, danger = false, disabled = false) { return <Pressable accessibilityRole="button" disabled={busy || !loaded || disabled} onPress={onPress} style={[border, { opacity: busy || !loaded || disabled ? 0.5 : 1 }]}><Text style={theme.text("label", danger ? "danger" : "teal")}>{label}</Text></Pressable>; }
  const profileField = (key: Exclude<keyof AtlasProfile, "gpa_scale">, label: string) => field(label, String(profile[key] ?? ""), (v) => setProfile({ ...profile, [key]: key === "focus_block_minutes" ? Number(v) : v || (key.startsWith("no_meeting") ? null : "") }));
  return <View style={{ gap: 12 }}>
    {busy && <ActivityIndicator />}{error && <Text accessibilityRole="alert" style={theme.text("body", "danger")}>{error}</Text>}{message && <Text style={theme.text("body", "teal")}>{message}</Text>}
    <Text style={theme.text("heading", "ink")}>Personal details</Text><Text style={theme.text("body", "ink")}>{email}</Text>{profileField("display_name", "Display name")}{profileField("timezone", "Timezone")}
    <Text style={theme.text("body", "inkMuted")}>Changing timezone keeps your schedule’s entered wall-clock times.</Text>
    <Text style={theme.text("heading", "ink")}>Planning</Text>{profileField("focus_block_minutes", "Focus block length (15–240 minutes)")}{profileField("work_start_time", "Work start (HH:MM)")}{profileField("work_end_time", "Work end (HH:MM)")}{profileField("no_meeting_start", "Unavailable from (optional)")}{profileField("no_meeting_end", "Unavailable until (optional)")}
    <Text style={theme.text("heading", "ink")}>GPA scale</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{GPA_SCALE_IDS.map((id) => { const active = profile.gpa_scale === id; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active, disabled: busy || !loaded }} disabled={busy || !loaded} key={id} onPress={() => setProfile({ ...profile, gpa_scale: id })} style={[border, { borderColor: active ? theme.colors.teal : theme.colors.line, backgroundColor: active ? theme.colors.teal : "transparent" }]}><Text style={[theme.text("label", "teal"), active && { color: theme.colors.onTeal }]}>{GPA_SCALES[id].label}</Text></Pressable>; })}</View>
    {button("Save profile", () => void action("/api/mobile/profile", { profile }, "PATCH"))}
    <Text style={theme.text("heading", "ink")}>Account</Text>{field("Current password", password, setPassword, true)}{field("New email", newEmail, setNewEmail)}{button("Change email", () => void action("/api/mobile/account/manage", { action: "email", email: newEmail, currentPassword: password, platform: "mobile" }))}
    {field("New password", newPassword, setNewPassword, true)}{field("Confirm new password", confirmPassword, setConfirmPassword, true)}{button("Change password", () => void action("/api/mobile/account/manage", { action: "password", currentPassword: password, newPassword, confirmPassword, platform: "mobile" }))}
    {button("Forgot password? Send recovery email", () => void action("/api/mobile/account/manage", { action: "recovery", platform: "mobile" }))}
    <Text style={theme.text("heading", "danger")}>Delete account</Text><Text style={theme.text("body", "inkMuted")}>Permanently removes your Atlas data. Enter your current password above and type DELETE below.</Text>{field("Deletion confirmation", confirmation, setConfirmation)}
    {button("Delete my account…", () => Alert.alert("Permanently delete account?", "Your account and Atlas data will be deleted. This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete permanently", style: "destructive", onPress: () => void action("/api/mobile/account", { confirmation, password }, "DELETE") }]), true, confirmation !== "DELETE" || !password)}
  </View>;
}
