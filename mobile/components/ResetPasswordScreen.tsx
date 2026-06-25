import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

type ResetPasswordScreenProps = {
  onComplete: () => void;
};

export function ResetPasswordScreen({ onComplete }: ResetPasswordScreenProps) {
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
        placeholderTextColor="#73808c"
        secureTextEntry
        style={styles.input}
        value={password}
      />
      <TextInput
        autoCapitalize="none"
        onChangeText={setConfirmPassword}
        placeholder="Confirm new password"
        placeholderTextColor="#73808c"
        secureTextEntry
        style={styles.input}
        value={confirmPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable disabled={loading} onPress={updatePassword} style={[styles.button, loading && styles.disabled]}>
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Update Password</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", gap: 12, padding: 24 },
  brand: { color: "#0f766e", fontSize: 18, fontWeight: "800" },
  title: { color: "#111827", fontSize: 30, fontWeight: "800", lineHeight: 36 },
  body: { color: "#475569", fontSize: 15, lineHeight: 22, marginBottom: 8 },
  input: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, color: "#111827", fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  error: { color: "#b91c1c", fontSize: 14, lineHeight: 20 },
  button: { alignItems: "center", backgroundColor: "#0f766e", borderRadius: 8, justifyContent: "center", minHeight: 52, marginTop: 6 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.58 },
});
