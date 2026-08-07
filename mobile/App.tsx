import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { InstrumentSans_400Regular, InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "./components/AuthScreen";
import { AccountSettingsScreen } from "./components/AccountSettingsScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { MealCoachScreen } from "./components/MealCoachScreen";
import {
  DetailHeader,
  MobileAppShell,
  SegmentedTabs,
  screenToTab,
  tabDefaultScreen,
  type MobileScreen,
  type MobileTab,
} from "./components/MobileAppShell";
import { MoreMenuScreen } from "./components/MoreMenuScreen";
import { MealsScreen } from "./components/MealsScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { NotificationSettingsScreen } from "./components/NotificationSettingsScreen";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { WorkoutCoachScreen } from "./components/WorkoutCoachScreen";
import { WorkoutPlanScreen } from "./components/WorkoutPlanScreen";
import { WorkoutsScreen } from "./components/WorkoutsScreen";
import { getMobileEnv } from "./lib/env";
import { ThemeProvider, useTheme } from "./lib/theme";
import { handleAuthDeepLink } from "./lib/auth-deep-link";
import { captureEvent, identifyAnalyticsUser, resetAnalyticsUser, Sentry } from "./lib/analytics";
import { supabase } from "./lib/supabase";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeScreen, setActiveScreen] = useState<MobileScreen>("dashboard");
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authLinkMessage, setAuthLinkMessage] = useState<string | undefined>();
  const env = getMobileEnv();
  const theme = useTheme();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  useEffect(() => {
    async function processLink(url: string | null) {
      if (!url) return;
      const result = await handleAuthDeepLink(url);
      if (result.error) setAuthLinkMessage(result.error);
      if (result.recovery && !result.error) setIsRecoveringPassword(true);
    }

    async function loadInitialSession() {
      await processLink(await Linking.getInitialURL());
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) identifyAnalyticsUser(data.session.user.id);
      setLoadingSession(false);
    }

    void loadInitialSession();

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void processLink(url);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession) identifyAnalyticsUser(nextSession.user.id);
      else resetAnalyticsUser();
      if (event === "PASSWORD_RECOVERY") setIsRecoveringPassword(true);
      if (nextSession) {
        setActiveScreen("dashboard");
      }
    });

    return () => {
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function openNotificationDestination(response: Notifications.NotificationResponse | null) {
      const screen = response?.notification.request.content.data.screen;
      if (screen === "dashboard" || screen === "workouts") {
        setActiveScreen(screen);
        captureEvent("notification_opened", { destination: screen });
      }
    }

    void Notifications.getLastNotificationResponseAsync().then(async (response) => {
      openNotificationDestination(response);
      if (response) await Notifications.clearLastNotificationResponseAsync();
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotificationDestination);
    return () => subscription.remove();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    resetAnalyticsUser();
  }

  function handleSelectTab(tab: MobileTab) {
    // Re-tapping the current tab keeps its sub-screen; switching tabs lands on the default.
    if (screenToTab[activeScreen] === tab) return;
    setActiveScreen(tabDefaultScreen[tab]);
  }

  function renderSignedInScreen() {
    const token = session!.access_token;

    if (activeScreen === "calendar") {
      return <CalendarScreen accessToken={token} />;
    }

    if (activeScreen === "meals" || activeScreen === "mealCoach") {
      return (
        <View style={styles.tabBody}>
          <SegmentedTabs
            onChange={setActiveScreen}
            options={[
              { value: "meals", label: "Log" },
              { value: "mealCoach", label: "Coach" },
            ]}
            value={activeScreen}
          />
          {activeScreen === "meals" ? (
            <MealsScreen accessToken={token} />
          ) : (
            <MealCoachScreen accessToken={token} />
          )}
        </View>
      );
    }

    if (
      activeScreen === "workouts" ||
      activeScreen === "workoutPlan" ||
      activeScreen === "workoutCoach"
    ) {
      return (
        <View style={styles.tabBody}>
          <SegmentedTabs
            onChange={setActiveScreen}
            options={[
              { value: "workouts", label: "Log" },
              { value: "workoutPlan", label: "Plan" },
              { value: "workoutCoach", label: "Coach" },
            ]}
            value={activeScreen}
          />
          {activeScreen === "workouts" ? (
            <WorkoutsScreen accessToken={token} />
          ) : activeScreen === "workoutPlan" ? (
            <WorkoutPlanScreen accessToken={token} />
          ) : (
            <WorkoutCoachScreen accessToken={token} />
          )}
        </View>
      );
    }

    if (activeScreen === "more") {
      return (
        <MoreMenuScreen onNavigate={setActiveScreen} onSignOut={signOut} />
      );
    }

    if (activeScreen === "goals") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("more")} title="Goals" />
          <GoalsScreen accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "onboarding") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("more")} title="Onboarding" />
          <OnboardingScreen accessToken={token} onComplete={() => setActiveScreen("dashboard")} />
        </View>
      );
    }

    if (activeScreen === "notifications") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("more")} title="Notifications" />
          <NotificationSettingsScreen accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "settings") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("more")} title="Settings & Legal" />
          <AccountSettingsScreen accessToken={token} onAccountDeleted={() => setSession(null)} />
        </View>
      );
    }

    return <DashboardScreen accessToken={token} />;
  }

  if (!env.isConfigured) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.paper }]}>
        <View style={styles.centered}>
          <Text style={styles.title}>Mobile environment missing</Text>
          <Text style={styles.body}>
            Add EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and
            EXPO_PUBLIC_API_BASE_URL to mobile/.env.
          </Text>
          <StatusBar style={theme.isDark ? "light" : "dark"} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadingSession || !fontsLoaded) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.paper }]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.teal} />
          {loadingSession ? <Text style={styles.body}>Loading session...</Text> : null}
          <StatusBar style={theme.isDark ? "light" : "dark"} />
        </View>
      </SafeAreaView>
    );
  }

  if (isRecoveringPassword) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.paper }]}>
        <ResetPasswordScreen
          onComplete={() => {
            setIsRecoveringPassword(false);
            setAuthLinkMessage("Password updated successfully.");
          }}
        />
        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.paper }]}>
        <AuthScreen initialMessage={authLinkMessage} />
        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <MobileAppShell activeTab={screenToTab[activeScreen]} onSelectTab={handleSelectTab}>
        {renderSignedInScreen()}
      </MobileAppShell>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  tabBody: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
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
    marginTop: 10,
  },
});

function Root() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

export default Sentry.wrap(Root);
