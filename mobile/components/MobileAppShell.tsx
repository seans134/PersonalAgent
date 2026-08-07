import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

export type MobileScreen =
  | "dashboard"
  | "calendar"
  | "meals"
  | "mealCoach"
  | "workouts"
  | "workoutPlan"
  | "workoutCoach"
  | "more"
  | "goals"
  | "onboarding"
  | "notifications"
  | "settings";

export type MobileTab = "today" | "calendar" | "meals" | "workouts" | "more";

// Which bottom tab owns each screen.
export const screenToTab: Record<MobileScreen, MobileTab> = {
  dashboard: "today",
  calendar: "calendar",
  meals: "meals",
  mealCoach: "meals",
  workouts: "workouts",
  workoutPlan: "workouts",
  workoutCoach: "workouts",
  more: "more",
  goals: "more",
  onboarding: "more",
  notifications: "more",
  settings: "more",
};

// The screen a tab lands on when tapped.
export const tabDefaultScreen: Record<MobileTab, MobileScreen> = {
  today: "dashboard",
  calendar: "calendar",
  meals: "meals",
  workouts: "workouts",
  more: "more",
};

const tabs: Array<{ key: MobileTab; label: string; icon: IconName }> = [
  { key: "today", label: "Today", icon: "today" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "meals", label: "Meals", icon: "meals" },
  { key: "workouts", label: "Train", icon: "workouts" },
  { key: "more", label: "More", icon: "more" },
];

type MobileAppShellProps = {
  activeTab: MobileTab;
  children: React.ReactNode;
  onSelectTab: (tab: MobileTab) => void;
};

export function MobileAppShell({ activeTab, children, onSelectTab }: MobileAppShellProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>{children}</View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const color = isActive ? theme.colors.teal : theme.colors.inkMuted;

          return (
            <Pressable
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              style={styles.tabButton}
            >
              <Icon color={color} name={tab.icon} size={22} strokeWidth={isActive ? 2.1 : 1.8} />
              <Text style={[theme.text("monoTime"), styles.tabLabel, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SegmentedTabs<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  value: T;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.segmentRow}>
      {options.map((option) => {
        const isActive = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentButton, isActive && styles.segmentActive]}
          >
            <Text style={[theme.text("label"), { color: isActive ? theme.colors.ink : theme.colors.inkMuted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DetailHeader({ onBack, title }: { onBack: () => void; title: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.detailHeader}>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Icon color={theme.colors.teal} name="back" size={20} strokeWidth={2.2} />
        <Text style={theme.text("heading", "teal")}>More</Text>
      </Pressable>
      <Text style={theme.text("title", "ink")}>{title}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    content: {
      flex: 1,
    },
    tabBar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.line,
      borderTopWidth: 1,
      flexDirection: "row",
      paddingBottom: space.xs2,
      paddingTop: space.sm,
    },
    tabButton: {
      alignItems: "center",
      flex: 1,
      gap: 4,
      justifyContent: "center",
      paddingVertical: space.xs2,
    },
    tabLabel: {
      fontSize: 11,
    },
    segmentRow: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: radius.control,
      flexDirection: "row",
      margin: space.base,
      marginBottom: 0,
      padding: 3,
    },
    segmentButton: {
      alignItems: "center",
      borderRadius: radius.control - 3,
      flex: 1,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: space.sm,
    },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 1,
    },
    detailHeader: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: space.sm,
      minHeight: 52,
      paddingHorizontal: space.md,
    },
    backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 2,
      paddingRight: space.sm,
      paddingVertical: space.sm,
    },
  });
}
