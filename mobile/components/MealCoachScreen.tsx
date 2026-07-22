import { useState } from "react";
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
  applyMobileMealDraft,
  sendMealCoachMessage,
  type MobileMealCoachIntent,
  type MobileMealCoachResponse,
  type MobileMealDraft,
  type MobileMealSuggestionDraft,
} from "../lib/api";
import { captureEvent } from "../lib/analytics";
import { errorHaptic, successHaptic, tapHaptic } from "../lib/haptics";

type MealCoachScreenProps = {
  accessToken: string;
};

const intentLabels: Record<MobileMealCoachIntent, string> = {
  log: "Logging a meal",
  saved: "Saving a reusable meal",
  suggest: "Suggesting a meal",
};

const examples = [
  "I had a chicken rice bowl for lunch, about 650 calories",
  "Save my usual overnight oats as a reusable meal",
  "What should I eat before my workout?",
];

function nutritionSummary(draft: MobileMealDraft) {
  return [
    draft.calories !== null ? `${draft.calories} cal` : null,
    draft.protein_grams !== null ? `${draft.protein_grams}g protein` : null,
    draft.carbs_grams !== null ? `${draft.carbs_grams}g carbs` : null,
    draft.fat_grams !== null ? `${draft.fat_grams}g fat` : null,
    draft.fiber_grams !== null ? `${draft.fiber_grams}g fiber` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function DraftCard({ draft }: { draft: MobileMealDraft }) {
  return (
    <View style={styles.draftCard}>
      <Text style={styles.draftTitle}>{draft.name}</Text>
      <Text style={styles.draftMeta}>
        {draft.mode === "log" ? `${draft.meal_type} - ` : "Saved meal - "}
        {nutritionSummary(draft) || "Nutrition not provided"}
      </Text>
      {draft.notes ? <Text style={styles.draftDetail}>{draft.notes}</Text> : null}
    </View>
  );
}

function WarningBox({ warnings }: { warnings: string[] }) {
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

export function MealCoachScreen({ accessToken }: MealCoachScreenProps) {
  const [message, setMessage] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [response, setResponse] = useState<MobileMealCoachResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const suggestion = response?.intent === "suggest" ? response.suggestion : null;
  const draft = response?.draft ?? null;
  const canSend = message.trim().length >= 4 && !sending && !applying;

  async function send(text: string, forceIntent?: MobileMealCoachIntent) {
    const trimmed = text.trim();
    if (!trimmed) return;

    tapHaptic();
    setSending(true);
    setError(null);
    setStatus(null);

    try {
      const next = await sendMealCoachMessage(accessToken, trimmed, {
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

  async function applyDraft(target: MobileMealDraft | MobileMealSuggestionDraft, isSuggestion: boolean) {
    setApplying(true);
    setError(null);
    setStatus(null);

    try {
      await applyMobileMealDraft(accessToken, target);
      if (isSuggestion) captureEvent("meal_suggestion_accepted");
      successHaptic();
      setStatus(target.mode === "log" ? `Logged ${target.name}.` : `Saved ${target.name}.`);
      setResponse(null);
      setLastMessage("");
    } catch (nextError) {
      errorHaptic();
      setError(nextError instanceof Error ? nextError.message : "Unable to save meal.");
    } finally {
      setApplying(false);
    }
  }

  function rerouteOptions(): MobileMealCoachIntent[] {
    if (!response) return [];
    return (["log", "saved", "suggest"] as const).filter((intent) => intent !== response.intent);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.eyebrow}>Atlas assistant</Text>
          <Text style={styles.title}>Meal Coach</Text>
          <Text style={styles.subtitle}>
            Tell Atlas what you ate, what to save for later, or ask what to eat. It works out which
            one you meant.
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
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {response.intent === "saved" ? "Save Meal" : "Log Meal"}
                  </Text>
                )}
              </Pressable>
            ) : null}

            {lastMessage ? (
              <View style={styles.rerouteSection}>
                <Text style={styles.rerouteLabel}>Not what you meant?</Text>
                <View style={styles.rerouteRow}>
                  {rerouteOptions().map((intent) => (
                    <Pressable
                      disabled={sending || applying}
                      key={intent}
                      onPress={() => send(lastMessage, intent)}
                      style={[styles.rerouteButton, (sending || applying) && styles.disabled]}
                    >
                      <Text style={styles.rerouteText}>{intentLabels[intent]}</Text>
                    </Pressable>
                  ))}
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
          placeholder={suggestion ? "Ask for a different option..." : "Message the meal coach..."}
          placeholderTextColor="#94a3b8"
          style={styles.composerInput}
          value={message}
        />
        <Pressable
          disabled={!canSend}
          onPress={() => send(message)}
          style={[styles.sendButton, !canSend && styles.disabled]}
        >
          {sending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 28,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    marginTop: 6,
  },
  subtitle: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  example: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  exampleText: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
  },
  intentRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  intentChip: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderRadius: 999,
    borderWidth: 1,
    color: "#065f46",
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  intentNote: {
    color: "#94a3b8",
    fontSize: 12,
  },
  userEcho: {
    color: "#64748b",
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  agentReply: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 22,
  },
  reviewSection: {
    gap: 8,
  },
  draftCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  draftTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  draftMeta: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  draftDetail: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  reasonText: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  warningTitle: {
    color: "#92400e",
    fontSize: 13,
    fontWeight: "800",
  },
  warningText: {
    color: "#92400e",
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  rerouteSection: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  rerouteLabel: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  rerouteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rerouteButton: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rerouteText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  composerInput: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 20,
    borderWidth: 1,
    color: "#111827",
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 20,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 20,
  },
  sendText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.58,
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  success: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
});
