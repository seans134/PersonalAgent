import { useCallback, useEffect, useState, useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          colors={[theme.colors.teal]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={theme.colors.teal}
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
            <ActivityIndicator color={theme.colors.teal} />
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
            <ActivityIndicator color={theme.colors.teal} />
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
              placeholderTextColor={theme.colors.inkMuted}
              style={styles.input}
              value={workStartTime}
            />
            <Text style={styles.label}>Work end</Text>
            <TextInput
              onChangeText={setWorkEndTime}
              placeholder="17:00"
              placeholderTextColor={theme.colors.inkMuted}
              style={styles.input}
              value={workEndTime}
            />
            <Text style={styles.label}>Focus block minutes</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setFocusBlockMinutes}
              placeholder="60"
              placeholderTextColor={theme.colors.inkMuted}
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
              placeholderTextColor={theme.colors.inkMuted}
              style={styles.input}
              value={goalTitle}
            />
            <Text style={styles.label}>Why it matters</Text>
            <TextInput
              multiline
              onChangeText={setGoalDescription}
              placeholder="This unlocks the next milestone."
              placeholderTextColor={theme.colors.inkMuted}
              style={[styles.input, styles.textArea]}
              value={goalDescription}
            />
            <Text style={styles.label}>Minimum minutes today</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={setMinimumDailyMinutes}
              placeholder="30"
              placeholderTextColor={theme.colors.inkMuted}
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
                <ActivityIndicator color={theme.colors.surface} />
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

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
  content: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    ...theme.text("monoLabel", "teal"),
  },
  title: {
    ...theme.text("displayLg", "ink"),
  },
  body: {
    ...theme.text("bodyLg", "inkMuted"),
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  panelTitle: {
    ...theme.text("heading", "ink"),
  },
  panelBody: {
    ...theme.text("body", "inkMuted"),
  },
  label: {
    ...theme.text("label", "ink"),
    marginTop: 8,
  },
  input: {
    ...theme.text("bodyLg", "ink"),
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
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
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  optionText: {
    ...theme.text("label", "ink"),
  },
  optionTextSelected: {
    color: colors.surface,
  },
  navRow: {
    flexDirection: "row",
    gap: 10,
  },
  error: {
    ...theme.text("body", "danger"),
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 20,
  },
  secondaryText: {
    ...theme.text("body", "ink"),
  },
  buttonPressed: {
    opacity: 0.78,
  },
  primaryText: {
    ...theme.text("heading", "surface"),
  },
});
}
