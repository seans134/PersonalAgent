import { useState } from "react";
import { Linking, Pressable, ScrollView, Text } from "react-native";
import { getMobileEnv } from "../lib/env";
import { useTheme } from "../lib/theme";
export function AccountSettingsScreen() {
  const theme = useTheme(); const [error, setError] = useState("");
  const env = getMobileEnv(); const base = (env.websiteUrl ?? env.apiBaseUrl ?? "").replace(/\/$/, "");
  async function open(path: string) { try { if (!base) throw new Error("Website is not configured."); await Linking.openURL(base + path); } catch { setError("Unable to open this page. Please try again."); } }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}><Text style={theme.text("displayXl", "ink")}>Support & privacy</Text>{error && <Text style={theme.text("body", "danger")}>{error}</Text>}{[["Support", "/support"], ["Privacy policy", "/privacy"], ["Terms of use", "/terms"]].map(([label, path]) => <Pressable accessibilityRole="link" key={path} onPress={() => void open(path)}><Text style={theme.text("body", "teal")}>{label}</Text></Pressable>)}<Text style={theme.text("body", "inkMuted")}>Account details, password changes, and deletion are in Profile.</Text></ScrollView>;
}
