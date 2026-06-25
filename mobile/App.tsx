import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
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
import { MobileAppShell, type MobileScreen } from "./components/MobileAppShell";
import { MealsScreen } from "./components/MealsScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { NotificationSettingsScreen } from "./components/NotificationSettingsScreen";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { WorkoutCoachScreen } from "./components/WorkoutCoachScreen";
import { WorkoutPlanScreen } from "./components/WorkoutPlanScreen";
import { WorkoutsScreen } from "./components/WorkoutsScreen";
import { getMobileEnv } from "./lib/env";
import { handleAuthDeepLink } from "./lib/auth-deep-link";
import { captureEvent, identifyAnalyticsUser, resetAnalyticsUser, Sentry } from "./lib/analytics";
import { supabase } from "./lib/supabase";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeScreen, setActiveScreen] = useState<MobileScreen>("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authLinkMessage, setAuthLinkMessage] = useState<string | undefined>();
  const env = getMobileEnv();

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

  function renderSignedInScreen() {
    if (activeScreen === "onboarding") {
      return (
        <OnboardingScreen
          accessToken={session!.access_token}
          onComplete={() => setActiveScreen("dashboard")}
        />
      );
    }

    if (activeScreen === "calendar") {
      return <CalendarScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "notifications") {
      return <NotificationSettingsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "settings") {
      return (
        <AccountSettingsScreen
          accessToken={session!.access_token}
          onAccountDeleted={() => setSession(null)}
        />
      );
    }

    if (activeScreen === "goals") {
      return <GoalsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "meals") {
      return <MealsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "mealCoach") {
      return <MealCoachScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "workouts") {
      return <WorkoutsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "workoutPlan") {
      return <WorkoutPlanScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "workoutCoach") {
      return <WorkoutCoachScreen accessToken={session!.access_token} />;
    }

    return (
      <DashboardScreen
        accessToken={session!.access_token}
        email={session!.user.email}
      />
    );
  }

  if (!env.isConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.title}>Mobile environment missing</Text>
          <Text style={styles.body}>
            Add EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and
            EXPO_PUBLIC_API_BASE_URL to mobile/.env.
          </Text>
          <StatusBar style="dark" />
        </View>
      </SafeAreaView>
    );
  }

  if (loadingSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#0f766e" />
          <Text style={styles.body}>Loading session...</Text>
          <StatusBar style="dark" />
        </View>
      </SafeAreaView>
    );
  }

  if (isRecoveringPassword) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ResetPasswordScreen
          onComplete={() => {
            setIsRecoveringPassword(false);
            setAuthLinkMessage("Password updated successfully.");
          }}
        />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AuthScreen initialMessage={authLinkMessage} />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <MobileAppShell
        activeScreen={activeScreen}
        isMenuOpen={isMenuOpen}
        onCloseMenu={() => setIsMenuOpen(false)}
        onNavigate={setActiveScreen}
        onOpenMenu={() => setIsMenuOpen(true)}
        onSignOut={signOut}
      >
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

export default Sentry.wrap(App);
