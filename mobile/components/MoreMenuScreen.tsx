import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemePreference } from "../lib/theme";
import type { Theme, ThemePreference } from "../lib/theme";
import { Icon } from "./Icon";
import type { MobileScreen } from "./MobileAppShell";

type MoreMenuScreenProps = {
  onNavigate: (screen: MobileScreen) => void;
  onSignOut: () => void;
};

const items: Array<{ screen: MobileScreen; label: string; subtitle: string }> = [
  { screen: "insights", label: "Insights", subtitle: "How your meals and workouts are trending" },
  { screen: "goals", label: "Goals", subtitle: "Active outcomes Atlas plans around" },
  { screen: "courses", label: "Courses", subtitle: "Grades and assignments per course" },
  { screen: "onboarding", label: "Onboarding", subtitle: "Schedule, profile, and first goals" },
  { screen: "notifications", label: "Notifications", subtitle: "Reminder schedule" },
  { screen: "settings", label: "Settings & Legal", subtitle: "Support and account" },
];

const themeOptions: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function MoreMenuScreen({ onNavigate, onSignOut }: MoreMenuScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { preference, setPreference } = useThemePreference();

  return (
    <ScrollView style={{ backgroundColor: theme.colors.paper }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={theme.text("monoLabel", "teal")}>Atlas</Text>
        <Text style={theme.text("displayXl", "ink")}>More</Text>
      </View>

      <View style={styles.card}>
        {items.map((item, index) => (
          <Pressable
            key={item.screen}
            onPress={() => onNavigate(item.screen)}
            style={({ pressed }) => [
              styles.row,
              index < items.length - 1 && styles.rowDivider,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowText}>
              <Text style={theme.text("heading", "ink")}>{item.label}</Text>
              <Text style={theme.text("body", "inkMuted")}>{item.subtitle}</Text>
            </View>
            <Icon color={theme.colors.inkMuted} name="back" size={18} strokeWidth={2} />
          </Pressable>
        ))}
      </View>

      <View style={styles.appearance}>
        <Text style={[theme.text("monoLabel", "inkMuted"), styles.appearanceLabel]}>Appearance</Text>
        <View style={styles.segmentRow}>
          {themeOptions.map((option) => {
            const isActive = option.value === preference;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => setPreference(option.value)}
                style={[styles.segmentButton, isActive && styles.segmentActive]}
              >
                <Text style={[theme.text("label"), { color: isActive ? theme.colors.onTeal : theme.colors.inkMuted }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}>
        <Text style={theme.text("heading", "danger")}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius } = theme;
  return StyleSheet.create({
    content: {
      gap: space.base,
      padding: space.lg,
      paddingBottom: space["3xl"],
    },
    header: {
      gap: space.xs,
      paddingTop: space.xs,
    },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      overflow: "hidden",
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      paddingHorizontal: space.base,
      paddingVertical: space.base,
    },
    rowDivider: {
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
    },
    rowPressed: {
      opacity: 0.65,
    },
    rowText: {
      flex: 1,
      gap: space.xs2,
    },
    appearance: {
      gap: space.sm,
    },
    appearanceLabel: {
      paddingHorizontal: space.xs,
    },
    segmentRow: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: radius.control,
      flexDirection: "row",
      padding: 3,
    },
    segmentButton: {
      alignItems: "center",
      borderRadius: radius.control - 3,
      flex: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: space.sm,
    },
    segmentActive: {
      backgroundColor: colors.teal,
    },
    signOut: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
    },
  });
}
