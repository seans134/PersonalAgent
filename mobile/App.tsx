import { ScheduleImportScreen } from "./components/ScheduleImportScreen";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useFonts } from "expo-font";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { InstrumentSans_400Regular, InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { useEffect, useRef, useState } from "react";
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
import { CourseDetailScreen } from "./components/CourseDetailScreen";
import { CoursesScreen } from "./components/CoursesScreen";
import { SemesterScreen } from "./components/SemesterScreen";
import { GpaScreen } from "./components/GpaScreen";
import { DashboardScreen } from "./components/DashboardScreen";
import { GoalsScreen } from "./components/GoalsScreen";
import { JoinCourseScreen } from "./components/JoinCourseScreen";
import { MealCoachScreen } from "./components/MealCoachScreen";
import {
  DetailHeader,
  MobileAppShell,
  isScreenEnabled,
  SegmentedTabs,
  screenToTab,
  tabDefaultScreen,
  type MobileScreen,
  type MobileTab,
} from "./components/MobileAppShell";
import { MoreMenuScreen } from "./components/MoreMenuScreen";
import { ProScreen } from "./components/ProScreen";
import { InsightsScreen } from "./components/InsightsScreen";
import { MealsScreen } from "./components/MealsScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { NotificationSettingsScreen } from "./components/NotificationSettingsScreen";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { SyllabusImportScreen } from "./components/SyllabusImportScreen";
import { WeeklyRhythmScreen } from "./components/WeeklyRhythmScreen";
import { WorkoutCoachScreen } from "./components/WorkoutCoachScreen";
import { WorkoutPlanScreen } from "./components/WorkoutPlanScreen";
import { WorkoutsScreen } from "./components/WorkoutsScreen";
import { getMobileEnv } from "./lib/env";
import { ThemeProvider, useTheme } from "./lib/theme";
import { handleAuthDeepLink } from "./lib/auth-deep-link";
import { parseJoinLink, type PaywallTrigger } from "@personal-agent/core";
import { captureEvent, identifyAnalyticsUser, resetAnalyticsUser, Sentry } from "./lib/analytics";
import { fetchMobileOnboardingStatus } from "./lib/api";
import { cancelExamReminders, endExamReminderSession } from "./lib/notifications";
import { StudyTimerProvider } from "./lib/study-timer";
import { resetPurchasesUser } from "./lib/purchases";
import { supabase } from "./lib/supabase";

// After a sign-in the user made (or sign-up), students who haven't finished onboarding
// start at step 1; everyone else lands on Today. Restored sessions are left alone.
async function screenAfterSignIn(accessToken: string): Promise<MobileScreen> {
  try {
    const status = await fetchMobileOnboardingStatus(accessToken);
    return status.completed ? "dashboard" : "onboarding";
  } catch {
    return "dashboard";
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeScreen, setActiveScreen] = useState<MobileScreen>("dashboard");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  // Where the course detail's back button goes: Courses, or Semester/GPA when opened from there.
  const [courseBackScreen, setCourseBackScreen] = useState<"courses" | "semester" | "gpa">("courses");
  // The term picked on Semester; kept here so it survives Semester -> course -> back. Null = default.
  const [semesterTerm, setSemesterTerm] = useState<string | null>(null);
  // The cumulative GPA target typed on GPA; kept here so it survives GPA -> course -> back.
  const [gpaTargetText, setGpaTargetText] = useState("");
  // Where the Atlas Pro screen was opened from (analytics) and where its back button goes.
  const [proOrigin, setProOrigin] = useState<{ trigger: PaywallTrigger; back: "profile" | "syllabusImport" }>({
    trigger: "menu",
    back: "profile",
  });
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false);
  const [authLinkMessage, setAuthLinkMessage] = useState<string | undefined>();
  // Token from a course share link (atlas://join/<token>). Held across sign-in/sign-up, then
  // the join screen shows over whatever screen the student is on until they add or close it.
  const [pendingJoinToken, setPendingJoinToken] = useState<string | null>(null);
  // Set by AuthScreen and the auth deep-link handler. supabase-js also emits
  // SIGNED_IN for restored sessions, setSession and (on web) tab refocus, so
  // only a flagged SIGNED_IN counts as the user signing in.
  const userSignInRef = useRef(false);
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
      const joinToken = parseJoinLink(url);
      if (joinToken) {
        setPendingJoinToken(joinToken);
        return;
      }
      const result = await handleAuthDeepLink(url, () => {
        userSignInRef.current = true;
      });
      if (result.error) userSignInRef.current = false;
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
      else {
        resetAnalyticsUser();
        void resetPurchasesUser();
      }
      if (event === "PASSWORD_RECOVERY") setIsRecoveringPassword(true);
      if (event === "SIGNED_OUT") {
        setActiveScreen("dashboard");
        setPendingJoinToken(null);
        setSemesterTerm(null);
        setGpaTargetText("");
        // Exam reminders belong to the signed-out student's courses; stop in-flight course loads rescheduling them.
        endExamReminderSession();
        void cancelExamReminders().catch(() => undefined);
      }
      // Token refreshes and restored sessions keep the student on their current screen.
      if (event === "SIGNED_IN" && nextSession && userSignInRef.current) {
        userSignInRef.current = false;
        setActiveScreen("dashboard");
        // Defer the API call out of the auth callback, as Supabase recommends.
        setTimeout(() => {
          void screenAfterSignIn(nextSession.access_token).then((screen) => {
            if (screen === "onboarding") setActiveScreen("onboarding");
          });
        }, 0);
      }
    });

    return () => {
      linkSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function openNotificationDestination(response: Notifications.NotificationResponse | null) {
      const data = response?.notification.request.content.data;
      const screen = data?.screen;
      if (screen === "course" && typeof data?.courseId === "string") {
        setSelectedCourseId(data.courseId);
        setCourseBackScreen("courses");
        setActiveScreen("courseDetail");
        captureEvent("notification_opened", { destination: "course" });
        return;
      }
      if ((screen === "dashboard" || screen === "workouts") && isScreenEnabled(screen)) {
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
    setPendingJoinToken(null);
    endExamReminderSession();
    await supabase.auth.signOut();
    resetAnalyticsUser();
    void resetPurchasesUser();
  }

  function openPro(trigger: PaywallTrigger, back: "profile" | "syllabusImport") {
    setProOrigin({ trigger, back });
    setActiveScreen("pro");
  }

  function openCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setCourseBackScreen("courses");
    setActiveScreen("courseDetail");
  }

  function openCourseFromSemester(courseId: string) {
    setSelectedCourseId(courseId);
    setCourseBackScreen("semester");
    setActiveScreen("courseDetail");
  }

  function openCourseFromGpa(courseId: string) {
    setSelectedCourseId(courseId);
    setCourseBackScreen("gpa");
    setActiveScreen("courseDetail");
  }

  function handleSelectTab(tab: MobileTab) {
    // A tab press while the join screen is up dismisses it and goes to that tab.
    if (pendingJoinToken) {
      setPendingJoinToken(null);
      setActiveScreen(tabDefaultScreen[tab]);
      return;
    }
    // Re-tapping the current tab keeps its sub-screen; switching tabs lands on the default.
    if (screenToTab[activeScreen] === tab) return;
    setActiveScreen(tabDefaultScreen[tab]);
  }

  function renderSignedInScreen() {
    const token = session!.access_token;

    if (pendingJoinToken) {
      return (
        <View style={styles.tabBody}>
          <JoinCourseScreen
            accessToken={token}
            key={pendingJoinToken}
            onClose={() => setPendingJoinToken(null)}
            onJoined={(courseId) => {
              setPendingJoinToken(null);
              openCourse(courseId);
            }}
            token={pendingJoinToken}
          />
        </View>
      );
    }

    if (activeScreen === "scheduleImport") return <ScheduleImportScreen accessToken={token} onBack={() => setActiveScreen("calendar")} />;

    if (activeScreen === "calendar") {
      return <CalendarScreen accessToken={token} onImport={() => setActiveScreen("scheduleImport")} />;
    }

    if (!isScreenEnabled(activeScreen)) {
      return <DashboardScreen accessToken={token} onOpenCourse={openCourse} onOpenCourses={() => setActiveScreen("courses")} />;
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

    if (activeScreen === "profile") {
      return (
        <MoreMenuScreen accessToken={token} onAccountDeleted={() => {
            setPendingJoinToken(null);
            setSession(null);
          }} onNavigate={(screen) => (screen === "pro" ? openPro("profile", "profile") : setActiveScreen(screen))} onSignOut={signOut} />
      );
    }

    if (activeScreen === "insights") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Insights" />
          <InsightsScreen accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "goals") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Goals" />
          <GoalsScreen accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "courses") {
      return (
        <View style={styles.tabBody}>
          <CoursesScreen
            accessToken={token}
            onImportSyllabus={() => setActiveScreen("syllabusImport")}
            onOpenCourse={openCourse}
            onOpenSemester={() => setActiveScreen("semester")}
            onOpenGpa={() => setActiveScreen("gpa")}
          />
        </View>
      );
    }

    if (activeScreen === "semester") {
      return (
        <View style={styles.tabBody}>
          <SemesterScreen
            accessToken={token}
            onBack={() => setActiveScreen("courses")}
            onOpenCourse={openCourseFromSemester}
            onTermChange={setSemesterTerm}
            term={semesterTerm}
          />
        </View>
      );
    }

    if (activeScreen === "gpa") {
      return (
        <View style={styles.tabBody}>
          <GpaScreen
            accessToken={token}
            onBack={() => setActiveScreen("courses")}
            onOpenCourse={openCourseFromGpa}
            onTargetTextChange={setGpaTargetText}
            targetText={gpaTargetText}
          />
        </View>
      );
    }

    if (activeScreen === "syllabusImport") {
      return (
        <View style={styles.tabBody}>
          <SyllabusImportScreen
            accessToken={token}
            onBack={() => setActiveScreen("courses")}
            onImported={openCourse}
            onUpgrade={() => openPro("import_limit", "syllabusImport")}
          />
        </View>
      );
    }

    if (activeScreen === "courseDetail") {
      if (!selectedCourseId) return null;

      return (
        <View style={styles.tabBody}>
          <CourseDetailScreen
            accessToken={token}
            backLabel={courseBackScreen === "semester" ? "Semester" : courseBackScreen === "gpa" ? "GPA" : "Courses"}
            courseId={selectedCourseId}
            onBack={() => setActiveScreen(courseBackScreen)}
          />
        </View>
      );
    }

    if (activeScreen === "onboarding") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Setup" />
          <OnboardingScreen onImport={() => setActiveScreen("scheduleImport")} accessToken={token} onComplete={() => setActiveScreen("dashboard")} />
        </View>
      );
    }

    if (activeScreen === "weeklyRhythm") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Weekly rhythm" />
          <WeeklyRhythmScreen onImport={() => setActiveScreen("scheduleImport")} accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "notifications") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Notifications" />
          <NotificationSettingsScreen accessToken={token} />
        </View>
      );
    }

    if (activeScreen === "pro") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader
            backLabel={proOrigin.back === "syllabusImport" ? "Import" : "More"}
            onBack={() => setActiveScreen(proOrigin.back)}
            title="Atlas Pro"
          />
          <ProScreen accessToken={token} trigger={proOrigin.trigger} userId={session!.user.id} />
        </View>
      );
    }

    if (activeScreen === "settings") {
      return (
        <View style={styles.tabBody}>
          <DetailHeader onBack={() => setActiveScreen("profile")} title="Support & privacy" />
          <AccountSettingsScreen />
        </View>
      );
    }

    return <DashboardScreen accessToken={token} onOpenCourse={openCourse} onOpenCourses={() => setActiveScreen("courses")} />;
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
        <AuthScreen
          initialMessage={
            authLinkMessage ?? (pendingJoinToken ? "Sign in or create an account to add the shared course." : undefined)
          }
          key={pendingJoinToken ? "join" : "auth"}
          onSignInAttempt={(pending) => {
            userSignInRef.current = pending;
          }}
        />
        <StatusBar style={theme.isDark ? "light" : "dark"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Keyed by user so a different sign-in never shows the previous student's timer. */}
      <StudyTimerProvider accessToken={session.access_token} key={session.user.id}>
        <MobileAppShell activeTab={pendingJoinToken ? "courses" : screenToTab[activeScreen]} onSelectTab={handleSelectTab}>
          {renderSignedInScreen()}
        </MobileAppShell>
      </StudyTimerProvider>
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
