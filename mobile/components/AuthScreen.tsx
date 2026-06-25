import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getMobileEnv } from "../lib/env";
import { captureEvent } from "../lib/analytics";
import { supabase } from "../lib/supabase";

type AuthMode = "sign-in" | "sign-up";

export function AuthScreen({ initialMessage }: { initialMessage?: string }) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | undefined>(initialMessage);
  const [loading, setLoading] = useState(false);
  const env = getMobileEnv();

  async function openPublicPage(path: string) {
    const baseUrl = (env.websiteUrl ?? env.apiBaseUrl ?? "").replace(/\/$/, "");
    if (!baseUrl) {
      setMessage("The production website URL is not configured.");
      return;
    }
    try {
      await Linking.openURL(`${baseUrl}${path}`);
    } catch {
      setMessage("Unable to open that page.");
    }
  }

  async function submit() {
    setMessage(undefined);
    setLoading(true);

    const credentials = {
      email: email.trim(),
      password,
    };

    const { authRedirectUrl } = getMobileEnv();
    const { error } = mode === "sign-in"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: authRedirectUrl } });

    if (error) {
      setMessage(error.message);
    } else if (mode === "sign-up") {
      captureEvent("sign_up_completed");
      setMessage("Account created. Check your email if confirmation is enabled.");
    }

    setLoading(false);
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      return;
    }

    setLoading(true);
    setMessage(undefined);
    const { authRedirectUrl } = getMobileEnv();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl });
    setMessage(error ? error.message : "Check your email for the password reset link.");
    setLoading(false);
  }

  const actionLabel = mode === "sign-in" ? "Sign In" : "Create Account";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>Atlas</Text>
        <Text style={styles.title}>Plan today from your real life.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#73808c"
          style={styles.input}
          textContentType="emailAddress"
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#73808c"
          secureTextEntry
          style={styles.input}
          textContentType={mode === "sign-in" ? "password" : "newPassword"}
          value={password}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          disabled={loading}
          onPress={submit}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || loading) && styles.buttonPressed,
          ]}
        >
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{actionLabel}</Text>}
        </Pressable>

        {mode === "sign-in" ? (
          <Pressable disabled={loading} onPress={requestPasswordReset} style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Forgot password?</Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={loading}
          onPress={() => {
            setMessage(undefined);
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>
            {mode === "sign-in" ? "Need an account? Create one" : "Already have an account? Sign in"}
          </Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => openPublicPage("/privacy")}><Text style={styles.legalText}>Privacy</Text></Pressable>
          <Pressable onPress={() => openPublicPage("/terms")}><Text style={styles.legalText}>Terms</Text></Pressable>
          <Pressable onPress={() => openPublicPage("/support")}><Text style={styles.legalText}>Support</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    marginBottom: 28,
  },
  brand: {
    color: "#0f766e",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  message: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    padding: 12,
  },
  secondaryText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "600",
  },
  legalLinks: {
    flexDirection: "row",
    gap: 20,
    justifyContent: "center",
    paddingTop: 6,
  },
  legalText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
