import { useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

type ResetPasswordScreenProps = {
  onComplete: () => void;
};

export function ResetPasswordScreen({ onComplete }: ResetPasswordScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updatePassword() {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onComplete();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Atlas</Text>
      <Text style={styles.title}>Choose a new password</Text>
      <Text style={styles.body}>Your recovery link was accepted. Set the password you will use next time.</Text>
      <TextInput
        autoCapitalize="none"
        onChangeText={setPassword}
        placeholder="New password"
        placeholderTextColor={theme.colors.inkMuted}
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        placeholderTextColor={theme.colors.inkMuted}
        secureTextEntry
        style={styles.input}
        value={confirmPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={loading} onPress={updatePassword} style={[styles.button, loading && styles.disabled]}>
        {loading ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.buttonText}>Update Password</Text>}
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  container: { flex: 1, justifyContent: "center", gap: 12, padding: 24 },
  brand: {
    ...theme.text("title", "teal"),
  },
  title: {
    ...theme.text("displayXl", "ink"),
  },
  body: {
    ...theme.text("body", "inkMuted"),
    marginBottom: 8,
  },
  input: {
    ...theme.text("bodyLg", "ink"),
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  error: {
    ...theme.text("body", "danger"),
  },
  button: { alignItems: "center", backgroundColor: colors.teal, borderRadius: 8, justifyContent: "center", minHeight: 52, marginTop: 6 },
  buttonText: {
    ...theme.text("heading", "surface"),
  },
  disabled: { opacity: 0.58 },
});
}
