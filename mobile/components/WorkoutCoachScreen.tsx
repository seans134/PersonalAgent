import { useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  applyMobileWorkoutDraft,
  sendWorkoutCoachMessage,
  type MobileWorkoutCoachIntent,
  type MobileWorkoutCoachResponse,
  type MobileWorkoutDraft,
  type MobileWorkoutSuggestionDraft,
} from "../lib/api";
import { captureEvent } from "../lib/analytics";
import { errorHaptic, successHaptic, tapHaptic } from "../lib/haptics";

type WorkoutCoachScreenProps = {
  accessToken: string;
};

const intentLabels: Record<MobileWorkoutCoachIntent, string> = {
  log: "Logging a workout",
  suggest: "Suggesting a workout",
};

const examples = [
  "Ran 5k this morning in 27 minutes",
  "Did 4 sets of squats at 185 pounds",
  "What should I train today?",
];

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metricText(metrics: MobileWorkoutDraft["metrics"]) {
  return Object.entries(metrics ?? {})
    .flatMap(([key, value]) => (value === null || value === "" ? [] : [`${titleCase(key)}: ${value}`]))
    .join(" - ");
}

function draftSummary(draft: MobileWorkoutDraft) {
  return [
    titleCase(draft.workout_type),
    titleCase(draft.tracking_method),
    `${draft.duration_minutes} min`,
    titleCase(draft.intensity),
    draft.calories_burned !== null ? `${draft.calories_burned} cal` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function DraftCard({ draft }: { draft: MobileWorkoutDraft }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const metrics = metricText(draft.metrics);

  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftTitle}>{draft.title}</Text>
      <Text style={styles.draftMeta}>{draftSummary(draft)}</Text>
      {metrics ? <Text style={styles.draftDetail}>{metrics}</Text> : null}
      {draft.notes ? <Text style={styles.draftDetail}>{draft.notes}</Text> : null}
    </View>
  );
}

function WarningBox({ warnings }: { warnings: string[] }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  if (warnings.length === 0) return null;

  return (
    <View style={styles.warningBox}>
      <Text style={styles.warningTitle}>Review notes</Text>
      {warnings.map((warning, index) => (
        <Text key={`${warning}-${index}`} style={styles.warningText}>- {warning}</Text>
      ))}
    </View>
  );
}

export function WorkoutCoachScreen({ accessToken }: WorkoutCoachScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [message, setMessage] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [response, setResponse] = useState<MobileWorkoutCoachResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const suggestion = response?.intent === "suggest" ? response.suggestion : null;
  const draft = response?.draft ?? null;
  const canSend = message.trim().length >= 4 && !sending && !applying;

  async function send(text: string, forceIntent?: MobileWorkoutCoachIntent) {
    const trimmed = text.trim();
    if (!trimmed) return;

    tapHaptic();
    setSending(true);
    setError(null);
    setStatus(null);

    try {
      const next = await sendWorkoutCoachMessage(accessToken, trimmed, {
        // Passing the live suggestion lets follow-ups refine it instead of starting over.
        currentDraft: suggestion,
        forceIntent: forceIntent ?? null,
      });
      setResponse(next);
      setLastMessage(trimmed);
      setMessage("");
    } catch (nextError) {
      errorHaptic();
      setError(nextError instanceof Error ? nextError.message : "Unable to handle that message.");
    } finally {
      setSending(false);
    }
  }

  async function applyDraft(
    target: MobileWorkoutDraft | MobileWorkoutSuggestionDraft,
    isSuggestion: boolean,
  ) {
    setApplying(true);
    setError(null);
    setStatus(null);

    try {
      await applyMobileWorkoutDraft(accessToken, target);
      if (isSuggestion) captureEvent("workout_suggestion_accepted");
      successHaptic();
      setStatus(`Logged ${target.title}.`);
      setResponse(null);
      setLastMessage("");
    } catch (nextError) {
      errorHaptic();
      setError(nextError instanceof Error ? nextError.message : "Unable to log workout.");
    } finally {
      setApplying(false);
    }
  }

  const rerouteIntent: MobileWorkoutCoachIntent | null = response
    ? response.intent === "log"
      ? "suggest"
      : "log"
    : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.eyebrow}>Atlas assistant</Text>
          <Text style={styles.title}>Workout Coach</Text>
          <Text style={styles.subtitle}>
            Tell Atlas what you trained or ask what to do today. It works out which one you meant.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {status ? <Text style={styles.success}>{status}</Text> : null}

        {!response && !status ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Try saying</Text>
            {examples.map((example) => (
              <Pressable key={example} onPress={() => setMessage(example)} style={styles.example}>
                <Text style={styles.exampleText}>{example}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {response ? (
          <View style={styles.panel}>
            <View style={styles.intentRow}>
              <Text style={styles.intentChip}>{intentLabels[response.intent]}</Text>
              {response.intent_source === "heuristic" ? (
                <Text style={styles.intentNote}>matched locally</Text>
              ) : null}
            </View>

            {lastMessage ? <Text style={styles.userEcho}>{lastMessage}</Text> : null}
            {response.agent_reply ? (
              <Text style={styles.agentReply}>{response.agent_reply}</Text>
            ) : null}

            {suggestion ? (
              <View style={styles.reviewSection}>
                <DraftCard draft={suggestion} />
                {suggestion.suggested_timing ? (
                  <Text style={styles.draftDetail}>{suggestion.suggested_timing}</Text>
                ) : null}
                <Text style={styles.reasonText}>{suggestion.suggestion_reason}</Text>
                {suggestion.target_alignment ? (
                  <Text style={styles.draftDetail}>{suggestion.target_alignment}</Text>
                ) : null}
              </View>
            ) : null}

            {draft ? (
              <View style={styles.reviewSection}>
                <DraftCard draft={draft} />
              </View>
            ) : null}

            <WarningBox warnings={response.warnings} />

            {suggestion || draft ? (
              <Pressable
                disabled={applying}
                onPress={() => applyDraft((suggestion ?? draft)!, Boolean(suggestion))}
                style={[styles.primaryButton, applying && styles.disabled]}
              >
                {applying ? (
                  <ActivityIndicator color={theme.colors.surface} />
                ) : (
                  <Text style={styles.primaryButtonText}>Log Workout</Text>
                )}
              </Pressable>
            ) : null}

            {lastMessage && rerouteIntent ? (
              <View style={styles.rerouteSection}>
                <Text style={styles.rerouteLabel}>Not what you meant?</Text>
                <View style={styles.rerouteRow}>
                  <Pressable
                    disabled={sending || applying}
                    onPress={() => send(lastMessage, rerouteIntent)}
                    style={[styles.rerouteButton, (sending || applying) && styles.disabled]}
                  >
                    <Text style={styles.rerouteText}>{intentLabels[rerouteIntent]}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          multiline
          onChangeText={setMessage}
          placeholder={suggestion ? "Ask for a different option..." : "Message the workout coach..."}
          placeholderTextColor={theme.colors.inkMuted}
          style={styles.composerInput}
          value={message}
        />
        <Pressable
          disabled={!canSend}
          onPress={() => send(message)}
          style={[styles.sendButton, !canSend && styles.disabled]}
        >
          {sending ? <ActivityIndicator color={theme.colors.surface} /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 28,
  },
  eyebrow: {
    ...theme.text("monoLabel", "teal"),
  },
  title: {
    ...theme.text("displayLg", "ink"),
    marginTop: 6,
  },
  subtitle: {
    ...theme.text("body", "inkMuted"),
    marginTop: 8,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  panelTitle: {
    ...theme.text("heading", "ink"),
  },
  example: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  exampleText: {
    ...theme.text("body", "ink"),
  },
  intentRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  intentChip: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.success,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  intentNote: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  userEcho: {
    ...theme.text("body", "inkMuted"),
    fontStyle: "italic",
  },
  agentReply: {
    ...theme.text("body", "ink"),
  },
  reviewSection: {
    gap: 8,
  },
  draftCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  draftTitle: {
    ...theme.text("heading", "ink"),
  },
  draftMeta: {
    ...theme.text("body", "inkMuted"),
  },
  draftDetail: {
    ...theme.text("body", "inkMuted"),
  },
  reasonText: {
    ...theme.text("body", "ink"),
  },
  warningBox: {
    backgroundColor: colors.surface2,
    borderColor: colors.warning,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  warningTitle: {
    ...theme.text("label", "warning"),
  },
  warningText: {
    ...theme.text("body", "warning"),
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: {
    ...theme.text("body", "surface"),
  },
  rerouteSection: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  rerouteLabel: {
    ...theme.text("label", "inkMuted"),
  },
  rerouteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rerouteButton: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rerouteText: {
    ...theme.text("label", "ink"),
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  composerInput: {
    ...theme.text("body", "ink"),
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    maxHeight: 120,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 20,
  },
  sendText: {
    ...theme.text("body", "surface"),
  },
  disabled: {
    opacity: 0.58,
  },
  error: {
    ...theme.text("body", "danger"),
  },
  success: {
    ...theme.text("label", "success"),
  },
});
}
