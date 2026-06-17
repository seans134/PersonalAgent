import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type MobileScreen =
  | "dashboard"
  | "onboarding"
  | "calendar"
  | "goals"
  | "meals"
  | "workouts"
  | "workoutPlan";

type MobileAppShellProps = {
  activeScreen: MobileScreen;
  children: React.ReactNode;
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  onOpenMenu: () => void;
  onNavigate: (screen: MobileScreen) => void;
  onSignOut: () => void;
};

const navItems: Array<{ screen: MobileScreen; label: string; subtitle: string }> = [
  { screen: "dashboard", label: "Dashboard", subtitle: "Today plan" },
  { screen: "onboarding", label: "Onboarding", subtitle: "Profile and goals" },
  { screen: "calendar", label: "Local Calendar", subtitle: "Classes and blocks" },
  { screen: "goals", label: "Goals", subtitle: "Active outcomes" },
  { screen: "meals", label: "Meals", subtitle: "Nutrition logs" },
  { screen: "workouts", label: "Workouts", subtitle: "Training logs" },
  { screen: "workoutPlan", label: "Workout Plan", subtitle: "Weekly schedule" },
];

function titleForScreen(screen: MobileScreen) {
  return navItems.find((item) => item.screen === screen)?.label ?? "Atlas";
}

export function MobileAppShell({
  activeScreen,
  children,
  isMenuOpen,
  onCloseMenu,
  onOpenMenu,
  onNavigate,
  onSignOut,
}: MobileAppShellProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="Open menu" onPress={onOpenMenu} style={styles.menuButton}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </Pressable>
        <View>
          <Text style={styles.brand}>Atlas</Text>
          <Text style={styles.screenTitle}>{titleForScreen(activeScreen)}</Text>
        </View>
      </View>

      <View style={styles.content}>{children}</View>

      <Modal animationType="fade" onRequestClose={onCloseMenu} transparent visible={isMenuOpen}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close menu" onPress={onCloseMenu} style={styles.scrim} />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerBrand}>Atlas</Text>
              <Text style={styles.drawerSubtitle}>Personal agent</Text>
            </View>

            <View style={styles.navList}>
              {navItems.map((item) => {
                const isActive = item.screen === activeScreen;

                return (
                  <Pressable
                    key={item.screen}
                    onPress={() => {
                      onNavigate(item.screen);
                      onCloseMenu();
                    }}
                    style={[styles.navItem, isActive && styles.navItemActive]}
                  >
                    <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
                    <Text style={[styles.navSubtitle, isActive && styles.navSubtitleActive]}>{item.subtitle}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                onCloseMenu();
                onSignOut();
              }}
              style={styles.signOutButton}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 64,
    paddingHorizontal: 16,
  },
  menuButton: {
    alignItems: "center",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  menuLine: {
    backgroundColor: "#111827",
    borderRadius: 2,
    height: 2,
    width: 19,
  },
  brand: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  screenTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "800",
  },
  content: {
    flex: 1,
  },
  modalRoot: {
    flex: 1,
    flexDirection: "row",
  },
  scrim: {
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    flex: 1,
  },
  drawer: {
    backgroundColor: "#ffffff",
    borderRightColor: "#e2e8f0",
    borderRightWidth: 1,
    height: "100%",
    padding: 20,
    position: "absolute",
    width: 300,
  },
  drawerHeader: {
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    paddingBottom: 18,
    paddingTop: 8,
  },
  drawerBrand: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "800",
  },
  drawerSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginTop: 2,
    textTransform: "uppercase",
  },
  navList: {
    gap: 8,
    marginTop: 22,
  },
  navItem: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  navItemActive: {
    backgroundColor: "#111827",
  },
  navLabel: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "800",
  },
  navLabelActive: {
    color: "#ffffff",
  },
  navSubtitle: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  navSubtitleActive: {
    color: "#cbd5e1",
  },
  signOutButton: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: "auto",
    minHeight: 48,
    justifyContent: "center",
  },
  signOutText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
});
