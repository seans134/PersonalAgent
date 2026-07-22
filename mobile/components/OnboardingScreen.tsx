import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NaturalLanguageOnboardingPanel } from "./NaturalLanguageOnboardingPanel";
import { OnboardingProgress, type OnboardingStep } from "./OnboardingProgress";
import { WeeklyScheduleGrid } from "./WeeklyScheduleGrid";
import {
  fetchMobileCalendar,
  saveMobileOnboarding,
  type MobileOnboardingInput,
  type MobileScheduleBlock,
} from "../lib/api";
import { tapHaptic } from "../lib/haptics";

type OnboardingScreenProps = {
  accessToken: string;
  onComplete: () => void;
};

const workoutOptions: MobileOnboardingInput["workoutPreference"][] = [
  "none",
  "light",
  "moderate",
  "intense",
];

const stepCopy: Record<OnboardingStep, { title: string; body: string }> = {
  1: {
    title: "Add school and work",
    body: "Start with the fixed commitments Atlas has to plan around: classes, labs, and shifts.",
  },
  2: {
    title: "Build your weekly rhythm",
    body: "Add recurring habits and protected time that shape your week outside school and work.",
  },
  3: {
    title: "Set your goals",
    body: "Describe the outcomes Atlas should plan around, then save your planner profile.",
  },
};

export function OnboardingScreen({ accessToken, onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [blocks, setBlocks] = useState<MobileScheduleBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blocksError, setBlocksError] = useState("");

  const [workStartTime, setWorkStartTime] = useState("09:00");
  const [workEndTime, setWorkEndTime] = useState("17:00");
  const [focusBlockMinutes, setFocusBlockMinutes] = useState("60");
  const [workoutPreference, setWorkoutPreference] =
    useState<MobileOnboardingInput["workoutPreference"]>("light");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [minimumDailyMinutes, setMinimumDailyMinutes] = useState("30");
  const [message, setMessage] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const loadBlocks = useCallback(async () => {
    try {
      setBlocksError("");
      const calendar = await fetchMobileCalendar(accessToken);
      setBlocks(calendar.scheduleBlocks);
    } catch (error) {
      setBlocksError(error instanceof Error ? error.message : "Unable to load schedule blocks.");
    } finally {
      setLoadingBlocks(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadBlocks();
    setRefreshing(false);
  }

  function goToStep(nextStep: OnboardingStep) {
    tapHaptic();
    setStep(nextStep);
  }

  async function submit() {
    setMessage(undefined);
    setSaving(true);

    try {
      await saveMobileOnboarding(accessToken, {
        workStartTime,
        workEndTime,
        focusBlockMinutes: Number(focusBlockMinutes),
        workoutPreference,
        goalTitle,
        goalDescription,
        goalPriority: 1,
        goalTaskType: "focus",
        minimumDailyMinutes: Number(minimumDailyMinutes),
      });
      onComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save onboarding.");
    }

    setSaving(false);
  }

  const copy = stepCopy[step];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={["#0f766e"]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor="#0f766e"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Step {step} of 3</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>

      <OnboardingProgress currentStep={step} onSelectStep={goToStep} />

      {blocksError ? <Text style={styles.error}>{blocksError}</Text> : null}

      {step === 1 ? (
        <>
          <NaturalLanguageOnboardingPanel
            accessToken={accessToken}
            mode="school_work"
            onApplied={loadBlocks}
          />
          {loadingBlocks ? (
            <ActivityIndicator color="#0f766e" />
          ) : (
            <WeeklyScheduleGrid
              accessToken={accessToken}
              blocks={blocks}
              categories={["school", "work"]}
              defaultCategory="school"
              onChanged={loadBlocks}
              visibleCategories={["school", "work"]}
            />
          )}
          <Pressable onPress={() => goToStep(2)} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Continue to weekly rhythm</Text>
          </Pressable>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <NaturalLanguageOnboardingPanel
            accessToken={accessToken}
            mode="weekly_rhythm"
            onApplied={loadBlocks}
          />
          {loadingBlocks ? (
            <ActivityIndicator color="#0f766e" />
          ) : (
            <WeeklyScheduleGrid
              accessToken={accessToken}
              blocks={blocks}
              categories={["study", "personal", "unavailable"]}
              defaultCategory="study"
              onChanged={loadBlocks}
              visibleCategories={["school", "work", "study", "personal", "unavailable"]}
            />
          )}
          <View style={styles.navRow}>
            <Pressable onPress={() => goToStep(1)} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
            <Pressable onPress={() => goToStep(3)} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Continue to goals</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <NaturalLanguageOnboardingPanel
            accessToken={accessToken}
            mode="goals"
            onApplied={loadBlocks}
          />

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Planner profile</Text>
            <Text style={styles.panelBody}>
              These answers create your planner profile and first active goal.
            </Text>

            <Text style={styles.label}>Work start</Text>
            <TextInput
              onChangeText={setWorkStartTime}
              placeholder="09:00"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={workStartTime}
            />
            <Text style={styles.label}>Work end</Text>
            <TextInput
              onChangeText={setWorkEndTime}
              placeholder="17:00"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={workEndTime}
            />
            <Text style={styles.label}>Focus block minutes</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setFocusBlockMinutes}
              placeholder="60"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={focusBlockMinutes}
            />

            <Text style={styles.label}>Workout preference</Text>
            <View style={styles.optionRow}>
              {workoutOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setWorkoutPreference(option)}
                  style={[styles.option, workoutPreference === option && styles.optionSelected]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      workoutPreference === option && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Top goal</Text>
            <TextInput
              onChangeText={setGoalTitle}
              placeholder="Finish project proposal"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={goalTitle}
            />
            <Text style={styles.label}>Why it matters</Text>
            <TextInput
              multiline
              onChangeText={setGoalDescription}
              placeholder="This unlocks the next milestone."
              placeholderTextColor="#94a3b8"
              style={[styles.input, styles.textArea]}
              value={goalDescription}
            />
            <Text style={styles.label}>Minimum minutes today</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setMinimumDailyMinutes}
              placeholder="30"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={minimumDailyMinutes}
            />
          </View>

          {message ? <Text style={styles.error}>{message}</Text> : null}

          <View style={styles.navRow}>
            <Pressable onPress={() => goToStep(2)} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || saving) && styles.buttonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>Save Onboarding</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  body: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e1ea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
  },
  panelBody: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 8,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#111827",
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  option: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionSelected: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },
  optionText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  optionTextSelected: {
    color: "#ffffff",
  },
  navRow: {
    flexDirection: "row",
    gap: 10,
  },
  error: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
