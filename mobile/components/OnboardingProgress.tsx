import { Pressable, StyleSheet, Text, View } from "react-native";

export type OnboardingStep = 1 | 2 | 3;

const steps: Array<{ step: OnboardingStep; label: string }> = [
  { step: 1, label: "School & work" },
  { step: 2, label: "Weekly rhythm" },
  { step: 3, label: "Goals" },
];

export function OnboardingProgress({
  currentStep,
  onSelectStep,
}: {
  currentStep: OnboardingStep;
  onSelectStep: (step: OnboardingStep) => void;
}) {
  return (
    <View style={styles.row}>
      {steps.map(({ step, label }) => {
        const isCurrent = step === currentStep;
        const isComplete = step < currentStep;

        return (
          <Pressable
            key={step}
            onPress={() => onSelectStep(step)}
            style={[
              styles.step,
              isCurrent ? styles.stepCurrent : isComplete ? styles.stepComplete : styles.stepPending,
            ]}
          >
            <View
              style={[
                styles.badge,
                isCurrent ? styles.badgeCurrent : isComplete ? styles.badgeComplete : styles.badgePending,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isCurrent
                    ? styles.badgeTextCurrent
                    : isComplete
                      ? styles.badgeTextComplete
                      : styles.badgeTextPending,
                ]}
              >
                {step}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                isCurrent ? styles.labelCurrent : isComplete ? styles.labelComplete : styles.labelPending,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  step: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 9,
  },
  stepCurrent: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  stepComplete: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
  },
  stepPending: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
  },
  badge: {
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  badgeCurrent: {
    borderColor: "#ffffff",
  },
  badgeComplete: {
    borderColor: "#111827",
  },
  badgePending: {
    borderColor: "#94a3b8",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  badgeTextCurrent: {
    color: "#ffffff",
  },
  badgeTextComplete: {
    color: "#111827",
  },
  badgeTextPending: {
    color: "#94a3b8",
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  labelCurrent: {
    color: "#ffffff",
  },
  labelComplete: {
    color: "#111827",
  },
  labelPending: {
    color: "#94a3b8",
  },
});
