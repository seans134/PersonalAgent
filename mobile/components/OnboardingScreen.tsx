import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { saveMobileOnboarding, type MobileOnboardingInput } from "../lib/api";

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

export function OnboardingScreen({ accessToken, onComplete }: OnboardingScreenProps) {
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

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Onboarding</Text>
        <Text style={styles.title}>Set the basics for today planning.</Text>
        <Text style={styles.body}>
          These answers create your planner profile and first active goal.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Work start</Text>
        <TextInput
          onChangeText={setWorkStartTime}
          placeholder="09:00"
          style={styles.input}
          value={workStartTime}
        />
        <Text style={styles.label}>Work end</Text>
        <TextInput
          onChangeText={setWorkEndTime}
          placeholder="17:00"
          style={styles.input}
          value={workEndTime}
        />
        <Text style={styles.label}>Focus block minutes</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setFocusBlockMinutes}
          placeholder="60"
          style={styles.input}
          value={focusBlockMinutes}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Workout preference</Text>
        <View style={styles.optionRow}>
          {workoutOptions.map((option) => (
            <Pressable
              key={option}
              onPress={() => setWorkoutPreference(option)}
              style={[
                styles.option,
                workoutPreference === option && styles.optionSelected,
              ]}
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
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Top goal</Text>
        <TextInput
          onChangeText={setGoalTitle}
          placeholder="Finish project proposal"
          placeholderTextColor="#73808c"
          style={styles.input}
          value={goalTitle}
        />
        <Text style={styles.label}>Why it matters</Text>
        <TextInput
          multiline
          onChangeText={setGoalDescription}
          placeholder="This unlocks the next milestone."
          placeholderTextColor="#73808c"
          style={[styles.input, styles.textArea]}
          value={goalDescription}
        />
        <Text style={styles.label}>Minimum minutes today</Text>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setMinimumDailyMinutes}
          placeholder="30"
          style={styles.input}
          value={minimumDailyMinutes}
        />
      </View>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <Pressable
        disabled={saving}
        onPress={submit}
        style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.buttonPressed]}
      >
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Save Onboarding</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 24,
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
  section: {
    gap: 10,
  },
  label: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#ffffff",
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
  error: {
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
