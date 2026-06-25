import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  applyMobileWorkoutDraft,
  parseMobileWorkout,
  suggestMobileWorkout,
  type MobileWorkoutDraft,
  type MobileWorkoutSuggestionDraft,
} from "../lib/api";
import { captureEvent } from "../lib/analytics";

type WorkoutCoachScreenProps = {
  accessToken: string;
};

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
  const [logText, setLogText] = useState("");
  const [logDraft, setLogDraft] = useState<MobileWorkoutDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applyingLog, setApplyingLog] = useState(false);
  const [suggestion, setSuggestion] = useState<MobileWorkoutSuggestionDraft | null>(null);
  const [suggestionReply, setSuggestionReply] = useState<string | null>(null);
  const [suggestionWarnings, setSuggestionWarnings] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function parseWorkoutText() {
    if (logText.trim().length < 8) {
      setError("Add a little more workout detail before parsing.");
      return;
    }

    setParsing(true);
    setLogDraft(null);
    setError(null);
    setMessage(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      const response = await parseMobileWorkout(accessToken, logText.trim(), timezone);
      setLogDraft(response.draft);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to parse workout.");
    } finally {
      setParsing(false);
    }
  }

  async function logDraftWorkout() {
    if (!logDraft) return;

    setApplyingLog(true);
    setError(null);
    setMessage(null);

    try {
      await applyMobileWorkoutDraft(accessToken, logDraft);
      setMessage("Workout logged.");
      setLogText("");
      setLogDraft(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to log workout.");
    } finally {
      setApplyingLog(false);
    }
  }

  async function requestSuggestion() {
    setSuggesting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await suggestMobileWorkout(accessToken, {
        currentDraft: suggestion,
        feedback: feedback.trim() || null,
      });
      setSuggestion(response.draft);
      setSuggestionReply(response.draft?.agent_reply || response.agent_reply);
      setSuggestionWarnings([...response.warnings, ...(response.draft?.warnings ?? [])]);
      setFeedback("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to suggest a workout.");
    } finally {
      setSuggesting(false);
    }
  }

  async function logSuggestion() {
    if (!suggestion) return;

    setApplyingSuggestion(true);
    setError(null);
    setMessage(null);

    try {
      await applyMobileWorkoutDraft(accessToken, suggestion);
      captureEvent("workout_suggestion_accepted");
      setMessage(`Logged ${suggestion.title}.`);
      setSuggestion(null);
      setSuggestionReply(null);
      setSuggestionWarnings([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to log suggested workout.");
    } finally {
      setApplyingSuggestion(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.eyebrow}>Atlas assistant</Text>
        <Text style={styles.title}>Workout Coach</Text>
        <Text style={styles.subtitle}>Log workouts from text or get a suggestion based on your current day.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Log from text</Text>
        <Text style={styles.helperText}>Describe what you did, then review the workout before saving.</Text>
        <TextInput
          multiline
          onChangeText={setLogText}
          placeholder="I ran 3 miles in 28 minutes this morning at moderate effort."
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.largeInput]}
          value={logText}
        />
        <Pressable
          disabled={parsing || logText.trim().length < 8}
          onPress={parseWorkoutText}
          style={[styles.primaryButton, (parsing || logText.trim().length < 8) && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>{parsing ? "Parsing..." : "Review Workout"}</Text>
        </Pressable>

        {logDraft ? (
          <View style={styles.reviewSection}>
            <DraftCard draft={logDraft} />
            <WarningBox warnings={logDraft.warnings} />
            <Pressable
              disabled={applyingLog}
              onPress={logDraftWorkout}
              style={[styles.outlineButton, applyingLog && styles.disabled]}
            >
              <Text style={styles.outlineButtonText}>{applyingLog ? "Logging..." : "Log Workout"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Workout suggestion</Text>
        <Text style={styles.helperText}>{"Atlas considers your goals, recent training, meals, and today's schedule."}</Text>

        {suggestionReply ? <Text style={styles.agentReply}>{suggestionReply}</Text> : null}
        {suggestion ? (
          <View style={styles.reviewSection}>
            <DraftCard draft={suggestion} />
            {suggestion.suggested_timing ? <Text style={styles.draftDetail}>{suggestion.suggested_timing}</Text> : null}
            <Text style={styles.reasonText}>{suggestion.suggestion_reason}</Text>
            {suggestion.target_alignment ? <Text style={styles.draftDetail}>{suggestion.target_alignment}</Text> : null}
            <WarningBox warnings={suggestionWarnings} />
          </View>
        ) : null}

        <TextInput
          onChangeText={setFeedback}
          placeholder={suggestion ? "Ask for a change..." : "Tell Atlas how you feel today..."}
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={feedback}
        />

        <View style={styles.actionRow}>
          <Pressable
            disabled={suggesting}
            onPress={requestSuggestion}
            style={[styles.primaryButton, styles.flexButton, suggesting && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>{suggesting ? "Thinking..." : suggestion ? "Update Suggestion" : "Get Suggestion"}</Text>
          </Pressable>
          {suggestion ? (
            <Pressable
              disabled={applyingSuggestion}
              onPress={logSuggestion}
              style={[styles.outlineButton, styles.flexButton, applyingSuggestion && styles.disabled]}
            >
              <Text style={styles.outlineButtonText}>{applyingSuggestion ? "Logging..." : "Log It"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 18, paddingBottom: 32 },
  eyebrow: { color: "#0f766e", fontSize: 12, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" },
  title: { color: "#111827", fontSize: 30, fontWeight: "800", lineHeight: 36 },
  subtitle: { color: "#475569", fontSize: 15, lineHeight: 21, marginTop: 4 },
  panel: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 8, borderWidth: 1, gap: 12, padding: 16 },
  panelTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  helperText: { color: "#64748b", fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, color: "#111827", fontSize: 15, minHeight: 46, paddingHorizontal: 12 },
  largeInput: { minHeight: 104, paddingTop: 12, textAlignVertical: "top" },
  primaryButton: { alignItems: "center", backgroundColor: "#0f766e", borderRadius: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800", textAlign: "center" },
  outlineButton: { alignItems: "center", borderColor: "#0f766e", borderRadius: 8, borderWidth: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  outlineButtonText: { color: "#0f766e", fontSize: 14, fontWeight: "800", textAlign: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  flexButton: { flex: 1, minWidth: 145 },
  reviewSection: { borderTopColor: "#e2e8f0", borderTopWidth: 1, gap: 10, paddingTop: 12 },
  draftCard: { backgroundColor: "#f8fafc", borderRadius: 8, gap: 5, padding: 12 },
  draftTitle: { color: "#111827", fontSize: 16, fontWeight: "800" },
  draftMeta: { color: "#475569", fontSize: 13, fontWeight: "700", lineHeight: 19 },
  draftDetail: { color: "#475569", fontSize: 13, lineHeight: 19 },
  reasonText: { color: "#334155", fontSize: 14, lineHeight: 20 },
  agentReply: { backgroundColor: "#f1f5f9", borderRadius: 8, color: "#334155", fontSize: 14, lineHeight: 20, padding: 12 },
  warningBox: { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderRadius: 8, borderWidth: 1, gap: 5, padding: 12 },
  warningTitle: { color: "#92400e", fontSize: 14, fontWeight: "800" },
  warningText: { color: "#92400e", fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.58 },
  error: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderRadius: 8, borderWidth: 1, color: "#b91c1c", fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 12 },
  success: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", borderRadius: 8, borderWidth: 1, color: "#047857", fontSize: 14, fontWeight: "700", lineHeight: 20, padding: 12 },
});
