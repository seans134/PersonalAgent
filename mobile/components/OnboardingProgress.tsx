import { useMemo } from "react";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ONBOARDING_STEPS,
  isOnboardingStepComplete,
  type OnboardingProgressInput,
  type OnboardingStepKey,
} from "@personal-agent/core";

export function OnboardingProgress({
  currentStep,
  progress,
  onSelectStep,
}: {
  currentStep: OnboardingStepKey;
  /** Saved course and class-time counts; they decide which steps show a check. */
  progress: OnboardingProgressInput;
  onSelectStep: (step: OnboardingStepKey) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      {ONBOARDING_STEPS.map(({ key, number, label }) => {
        const isCurrent = key === currentStep;
        // A skipped step stays unchecked; Done is never "complete" until the student is there.
        const isComplete = !isCurrent && key !== "done" && isOnboardingStepComplete(key, progress);

        return (
          <Pressable
            accessibilityLabel={`Step ${number}: ${label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isCurrent }}
            key={key}
            onPress={() => onSelectStep(key)}
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
                {isComplete ? "✓" : number}
              </Text>
            </View>
            <Text
              numberOfLines={2}
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

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
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
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  stepComplete: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  stepPending: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
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
    borderColor: colors.surface,
  },
  badgeComplete: {
    borderColor: colors.ink,
  },
  badgePending: {
    borderColor: colors.inkMuted,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  badgeTextCurrent: {
    color: colors.surface,
  },
  badgeTextComplete: {
    color: colors.ink,
  },
  badgeTextPending: {
    color: colors.inkMuted,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  labelCurrent: {
    color: colors.surface,
  },
  labelComplete: {
    color: colors.ink,
  },
  labelPending: {
    color: colors.inkMuted,
  },
});
}
