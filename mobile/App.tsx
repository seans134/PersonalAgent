import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen } from "./components/AuthScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { MobileAppShell, type MobileScreen } from "./components/MobileAppShell";
import { MealsScreen } from "./components/MealsScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { WorkoutPlanScreen } from "./components/WorkoutPlanScreen";
import { WorkoutsScreen } from "./components/WorkoutsScreen";
import { getMobileEnv } from "./lib/env";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeScreen, setActiveScreen] = useState<MobileScreen>("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const env = getMobileEnv();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        setActiveScreen("dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
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

    if (activeScreen === "goals") {
      return <GoalsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "meals") {
      return <MealsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "workouts") {
      return <WorkoutsScreen accessToken={session!.access_token} />;
    }

    if (activeScreen === "workoutPlan") {
      return <WorkoutPlanScreen accessToken={session!.access_token} />;
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

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <AuthScreen />
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
