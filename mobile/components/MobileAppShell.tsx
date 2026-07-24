import { Pressable, StyleSheet, Text, View } from "react-native";

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

const ACTIVE_COLOR = "#0f766e";
const INACTIVE_COLOR = "#94a3b8";

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

const tabs: Array<{ key: MobileTab; label: string }> = [
  { key: "today", label: "Today" },
  { key: "calendar", label: "Calendar" },
  { key: "meals", label: "Meals" },
  { key: "workouts", label: "Workouts" },
  { key: "more", label: "More" },
];

// Simple line-style glyphs drawn with Views so no icon-font dependency is needed.
function TabGlyph({ tab, color }: { tab: MobileTab; color: string }) {
  if (tab === "today") {
    return (
      <View style={glyph.box}>
        <View style={[glyph.roof, { borderBottomColor: color }]} />
        <View style={[glyph.houseBody, { borderColor: color }]} />
      </View>
    );
  }

  if (tab === "calendar") {
    return (
      <View style={glyph.box}>
        <View style={glyph.calRings}>
          <View style={[glyph.calRing, { backgroundColor: color }]} />
          <View style={[glyph.calRing, { backgroundColor: color }]} />
        </View>
        <View style={[glyph.calBody, { borderColor: color }]}>
          <View style={[glyph.calBar, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (tab === "meals") {
    return (
      <View style={glyph.box}>
        <View style={[glyph.plateOuter, { borderColor: color }]}>
          <View style={[glyph.plateInner, { borderColor: color }]} />
        </View>
      </View>
    );
  }

  if (tab === "workouts") {
    return (
      <View style={glyph.box}>
        <View style={glyph.barbell}>
          <View style={[glyph.weight, { backgroundColor: color }]} />
          <View style={[glyph.bar, { backgroundColor: color }]} />
          <View style={[glyph.weight, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={glyph.box}>
      <View style={glyph.dots}>
        <View style={[glyph.dot, { backgroundColor: color }]} />
        <View style={[glyph.dot, { backgroundColor: color }]} />
        <View style={[glyph.dot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

type MobileAppShellProps = {
  activeTab: MobileTab;
  children: React.ReactNode;
  onSelectTab: (tab: MobileTab) => void;
};

export function MobileAppShell({ activeTab, children, onSelectTab }: MobileAppShellProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>{children}</View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;

          return (
            <Pressable
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              style={styles.tabButton}
            >
              <TabGlyph color={color} tab={tab.key} />
              <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
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
            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function DetailHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.detailHeader}>
      <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
        <View style={styles.backChevron} />
        <Text style={styles.backText}>More</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row",
    paddingBottom: 6,
    paddingTop: 8,
  },
  tabButton: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    justifyContent: "center",
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  segmentRow: {
    backgroundColor: "#eef2f6",
    borderRadius: 10,
    flexDirection: "row",
    margin: 16,
    marginBottom: 0,
    padding: 3,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#0f172a",
  },
  detailHeader: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingRight: 8,
    paddingVertical: 8,
  },
  backChevron: {
    borderColor: "#0f766e",
    borderLeftWidth: 2,
    borderTopWidth: 2,
    height: 10,
    transform: [{ rotate: "-45deg" }],
    width: 10,
  },
  backText: {
    color: "#0f766e",
    fontSize: 16,
    fontWeight: "700",
  },
  detailTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
});

const glyph = StyleSheet.create({
  box: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  roof: {
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderLeftWidth: 9,
    borderRightColor: "transparent",
    borderRightWidth: 9,
  },
  houseBody: {
    borderWidth: 2,
    borderTopWidth: 0,
    height: 9,
    width: 14,
  },
  calRings: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 1,
  },
  calRing: {
    borderRadius: 1,
    height: 4,
    width: 2,
  },
  calBody: {
    alignItems: "center",
    borderRadius: 3,
    borderWidth: 2,
    height: 16,
    justifyContent: "flex-start",
    paddingTop: 3,
    width: 20,
  },
  calBar: {
    height: 2,
    width: 12,
  },
  plateOuter: {
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  plateInner: {
    borderRadius: 5,
    borderWidth: 2,
    height: 9,
    width: 9,
  },
  barbell: {
    alignItems: "center",
    flexDirection: "row",
  },
  weight: {
    borderRadius: 2,
    height: 14,
    width: 4,
  },
  bar: {
    height: 3,
    width: 12,
  },
  dots: {
    flexDirection: "row",
    gap: 4,
  },
  dot: {
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
});
