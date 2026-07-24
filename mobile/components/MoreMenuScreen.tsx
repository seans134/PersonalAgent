import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileScreen } from "./MobileAppShell";

type MoreMenuScreenProps = {
  onNavigate: (screen: MobileScreen) => void;
  onSignOut: () => void;
};

const items: Array<{ screen: MobileScreen; label: string; subtitle: string }> = [
  { screen: "goals", label: "Goals", subtitle: "Active outcomes Atlas plans around" },
  { screen: "onboarding", label: "Onboarding", subtitle: "Schedule, profile, and first goals" },
  { screen: "notifications", label: "Notifications", subtitle: "Reminder schedule" },
  { screen: "settings", label: "Settings & Legal", subtitle: "Support and account" },
];

export function MoreMenuScreen({ onNavigate, onSignOut }: MoreMenuScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Atlas</Text>
        <Text style={styles.title}>More</Text>
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
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
            </View>
            <View style={styles.chevron} />
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onSignOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.rowPressed]}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    gap: 4,
    paddingTop: 4,
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  title: {
    color: "#0f172a",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e6edf3",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowDivider: {
    borderBottomColor: "#eef2f6",
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.65,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  rowSubtitle: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    borderColor: "#cbd5e1",
    borderRightWidth: 2,
    borderTopWidth: 2,
    height: 10,
    transform: [{ rotate: "45deg" }],
    width: 10,
  },
  signOut: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  signOutText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "800",
  },
});
