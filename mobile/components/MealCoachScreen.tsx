import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  applyMobileMealDraft,
  parseMobileMeal,
  suggestMobileMeal,
  type MobileMealDraft,
  type MobileMealSuggestionDraft,
} from "../lib/api";
import { captureEvent } from "../lib/analytics";

type MealCoachScreenProps = {
  accessToken: string;
};

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
  const [mode, setMode] = useState<"log" | "saved">("log");
  const [mealText, setMealText] = useState("");
  const [mealDraft, setMealDraft] = useState<MobileMealDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [suggestion, setSuggestion] = useState<MobileMealSuggestionDraft | null>(null);
  const [suggestionReply, setSuggestionReply] = useState<string | null>(null);
  const [suggestionWarnings, setSuggestionWarnings] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function changeMode(nextMode: "log" | "saved") {
    setMode(nextMode);
    setMealDraft(null);
    setMessage(null);
    setError(null);
  }

  async function parseMealText() {
    if (mealText.trim().length < 8) {
      setError("Add a little more meal detail before parsing.");
      return;
    }

    setParsing(true);
    setMealDraft(null);
    setError(null);
    setMessage(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
      const response = await parseMobileMeal(accessToken, mode, mealText.trim(), timezone);
      setMealDraft(response.draft);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to parse meal.");
    } finally {
      setParsing(false);
    }
  }

  async function saveMealDraft() {
    if (!mealDraft) return;

    setApplyingDraft(true);
    setError(null);
    setMessage(null);

    try {
      await applyMobileMealDraft(accessToken, mealDraft);
      setMessage(mealDraft.mode === "log" ? "Meal logged." : "Saved meal added.");
      setMealText("");
      setMealDraft(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to save meal.");
    } finally {
      setApplyingDraft(false);
    }
  }

  async function requestSuggestion() {
    setSuggesting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await suggestMobileMeal(accessToken, {
        currentDraft: suggestion,
        feedback: feedback.trim() || null,
      });
      setSuggestion(response.draft);
      setSuggestionReply(response.draft?.agent_reply || response.agent_reply);
      setSuggestionWarnings([...response.warnings, ...(response.draft?.warnings ?? [])]);
      setFeedback("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to suggest a meal.");
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
      await applyMobileMealDraft(accessToken, suggestion);
      captureEvent("meal_suggestion_accepted");
      setMessage(`Logged ${suggestion.name}.`);
      setSuggestion(null);
      setSuggestionReply(null);
      setSuggestionWarnings([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to log suggested meal.");
    } finally {
      setApplyingSuggestion(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.eyebrow}>Atlas assistant</Text>
        <Text style={styles.title}>Meal Coach</Text>
        <Text style={styles.subtitle}>Log food from text, create reusable meals, or get a suggestion for today.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Meal from text</Text>
        <View style={styles.modeRow}>
          {(["log", "saved"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => changeMode(option)}
              style={[styles.modeButton, mode === option && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, mode === option && styles.modeTextActive]}>
                {option === "log" ? "Log Today" : "Save Reusable"}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.helperText}>
          {mode === "log" ? "Describe what you ate and review it before logging." : "Describe a meal you want to reuse later."}
        </Text>
        <TextInput
          multiline
          onChangeText={setMealText}
          placeholder={
            mode === "log"
              ? "Lunch was a chicken rice bowl, about 650 calories and 42g protein."
              : "My usual chicken rice bowl is 650 calories, 42g protein, 70g carbs, and 18g fat."
          }
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.largeInput]}
          value={mealText}
        />
        <Pressable
          disabled={parsing || mealText.trim().length < 8}
          onPress={parseMealText}
          style={[styles.primaryButton, (parsing || mealText.trim().length < 8) && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>{parsing ? "Parsing..." : "Review Meal"}</Text>
        </Pressable>

        {mealDraft ? (
          <View style={styles.reviewSection}>
            <DraftCard draft={mealDraft} />
            <WarningBox warnings={mealDraft.warnings} />
            <Pressable
              disabled={applyingDraft}
              onPress={saveMealDraft}
              style={[styles.outlineButton, applyingDraft && styles.disabled]}
            >
              <Text style={styles.outlineButtonText}>{applyingDraft ? "Saving..." : mealDraft.mode === "log" ? "Log Meal" : "Save Meal"}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Meal suggestion</Text>
        <Text style={styles.helperText}>{"Atlas considers today's meals, workouts, goals, and schedule."}</Text>
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
          placeholder={suggestion ? "Ask for a different option..." : "Tell Atlas what sounds good..."}
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
  modeRow: { flexDirection: "row", gap: 8 },
  modeButton: { alignItems: "center", borderColor: "#cbd5e1", borderRadius: 8, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 10 },
  modeButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  modeText: { color: "#334155", fontSize: 13, fontWeight: "800", textAlign: "center" },
  modeTextActive: { color: "#ffffff" },
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
  draftMeta: { color: "#475569", fontSize: 13, fontWeight: "700", lineHeight: 19, textTransform: "capitalize" },
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
