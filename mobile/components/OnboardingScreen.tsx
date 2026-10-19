import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  countClassTimeBlocks,
  nextOnboardingStep,
  onboardingStepNumber,
  type OnboardingProgressInput,
  type OnboardingStepKey,
} from "@personal-agent/core";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CourseForm, courseInputFromForm, emptyCourseForm, type CourseFormState } from "./CoursesScreen";
import { NaturalLanguageOnboardingPanel } from "./NaturalLanguageOnboardingPanel";
import { OnboardingProgress } from "./OnboardingProgress";
import { SyllabusImportScreen } from "./SyllabusImportScreen";
import { WeeklyScheduleGrid } from "./WeeklyScheduleGrid";
import {
  completeMobileOnboarding,
  createMobileCourse,
  fetchMobileCalendar,
  fetchMobileCourses,
  type MobileCourseSummary,
  type MobileScheduleBlock,
} from "../lib/api";
import { tapHaptic } from "../lib/haptics";

type OnboardingScreenProps = {
  accessToken: string;
  /** Leaves onboarding for Today. */
  onComplete: () => void;
};

const stepCopy: Record<OnboardingStepKey, { title: string; body: string }> = {
  courses: {
    title: "Add your courses",
    body: "Import each syllabus and Atlas pulls in the grade weights and due dates it needs to plan your studying.",
  },
  class_times: {
    title: "When are your classes?",
    body: "Tap open times on the week to add lectures, labs, and tutorials. Add work shifts too, so study time fits around them.",
  },
  done: {
    title: "You're set",
    body: "Head to Today and tap Generate today to chart your first study plan.",
  },
};

export function OnboardingScreen({ accessToken, onComplete }: OnboardingScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // null until the first load picks where to resume.
  const [step, setStep] = useState<OnboardingStepKey | null>(null);
  const [courses, setCourses] = useState<MobileCourseSummary[]>([]);
  const [blocks, setBlocks] = useState<MobileScheduleBlock[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");

  const [importing, setImporting] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState<CourseFormState>(emptyCourseForm);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");

  // Resume only once per visit; a token refresh recreates loadData but must not move the student.
  const resumedRef = useRef(false);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");

  const progress: OnboardingProgressInput = {
    courseCount: courses.length,
    classTimeCount: countClassTimeBlocks(blocks),
  };

  const loadData = useCallback(async (): Promise<OnboardingProgressInput | null> => {
    try {
      setLoadError("");
      const [courseResult, calendar] = await Promise.all([
        fetchMobileCourses(accessToken),
        fetchMobileCalendar(accessToken),
      ]);
      setCourses(courseResult.courses);
      setBlocks(calendar.scheduleBlocks);
      return {
        courseCount: courseResult.courses.length,
        classTimeCount: countClassTimeBlocks(calendar.scheduleBlocks),
      };
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your courses and schedule.");
      return null;
    }
  }, [accessToken]);

  const finish = useCallback(
    async (current: OnboardingProgressInput) => {
      setCompleting(true);
      setCompleteError("");
      try {
        await completeMobileOnboarding(accessToken, current);
      } catch (error) {
        setCompleteError(error instanceof Error ? error.message : "Unable to finish onboarding.");
      }
      setCompleting(false);
    },
    [accessToken],
  );

  useEffect(() => {
    if (resumedRef.current) return;
    const timeout = setTimeout(() => {
      resumedRef.current = true;
      void (async () => {
        const loaded = await loadData();
        // Resume at the first step still missing its data.
        const initial = loaded ? nextOnboardingStep(loaded) : "courses";
        setStep(initial);
        if (initial === "done" && loaded) await finish(loaded);
      })();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadData, finish]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function goToStep(nextStep: OnboardingStepKey) {
    tapHaptic();
    setNotice("");
    setStep(nextStep);
    // Reaching Done marks onboarding complete, whether the student finished or skipped.
    if (nextStep === "done") void finish(progress);
  }

  async function submitCourse() {
    setSavingCourse(true);
    setCourseError("");

    try {
      await createMobileCourse(accessToken, courseInputFromForm(courseForm));
      setNotice(`Added ${courseForm.name.trim()}.`);
      setCourseForm(emptyCourseForm);
      setShowCourseForm(false);
      await loadData();
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : "Unable to save course.");
    }

    setSavingCourse(false);
  }

  if (importing) {
    return (
      <SyllabusImportScreen
        accessToken={accessToken}
        backLabel="Setup"
        onBack={() => setImporting(false)}
        onImported={() => {
          // Stay in onboarding so the student can import the next syllabus.
          setImporting(false);
          setNotice("Course added. Import another syllabus, or continue when you're done.");
          void loadData();
        }}
      />
    );
  }

  if (step === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );
  }

  const copy = stepCopy[step];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          colors={[theme.colors.teal]}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          tintColor={theme.colors.teal}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Step {onboardingStepNumber(step)} of 3</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>

      <OnboardingProgress currentStep={step} onSelectStep={goToStep} progress={progress} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {step === "courses" ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Your courses</Text>
            {courses.length > 0 ? (
              courses.map((course) => {
                const meta = [course.code, course.term].filter(Boolean).join(" · ");
                return (
                  <View key={course.id} style={styles.courseRow}>
                    <Text style={styles.courseName}>{course.name}</Text>
                    {meta ? <Text style={styles.panelBody}>{meta}</Text> : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.panelBody}>No courses yet. Import a syllabus to add your first one.</Text>
            )}
          </View>

          <Pressable onPress={() => setImporting(true)} style={styles.primaryButton}>
            <Text style={styles.primaryText}>{courses.length > 0 ? "Import another syllabus" : "Import a syllabus"}</Text>
          </Pressable>

          {showCourseForm ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Add a course manually</Text>
              <CourseForm
                form={courseForm}
                onChange={(key, value) => setCourseForm((current) => ({ ...current, [key]: value }))}
              />
              {courseError ? <Text style={styles.error}>{courseError}</Text> : null}
              <View style={styles.navRow}>
                <Pressable
                  onPress={() => {
                    setShowCourseForm(false);
                    setCourseForm(emptyCourseForm);
                    setCourseError("");
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={savingCourse || !courseForm.name.trim()}
                  onPress={submitCourse}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.flexButton,
                    (pressed || savingCourse || !courseForm.name.trim()) && styles.buttonPressed,
                  ]}
                >
                  {savingCourse ? (
                    <ActivityIndicator color={theme.colors.surface} />
                  ) : (
                    <Text style={styles.primaryText}>Add course</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setShowCourseForm(true)} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Add a course manually</Text>
            </Pressable>
          )}

          <Pressable onPress={() => goToStep("class_times")} style={styles.primaryButton}>
            <Text style={styles.primaryText}>Continue to class times</Text>
          </Pressable>
          {courses.length === 0 ? (
            <Pressable hitSlop={8} onPress={() => goToStep("class_times")} style={styles.linkButton}>
              <Text style={styles.linkText}>Skip for now</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "class_times" ? (
        <>
          <NaturalLanguageOnboardingPanel
            accessToken={accessToken}
            mode="school_work"
            onApplied={() => {
              void loadData();
            }}
          />
          <WeeklyScheduleGrid
            accessToken={accessToken}
            blocks={blocks}
            categories={["school", "work"]}
            defaultCategory="school"
            onChanged={async () => {
              await loadData();
            }}
            visibleCategories={["school", "work"]}
          />
          <View style={styles.navRow}>
            <Pressable onPress={() => goToStep("courses")} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
            <Pressable onPress={() => goToStep("done")} style={[styles.primaryButton, styles.flexButton]}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </View>
          {progress.classTimeCount === 0 ? (
            <Pressable hitSlop={8} onPress={() => goToStep("done")} style={styles.linkButton}>
              <Text style={styles.linkText}>Skip for now</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === "done" ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelBody}>
              You can add more courses, change class times, or set optional goals and a weekly rhythm any time from
              More.
            </Text>
          </View>
          {completeError ? (
            <>
              <Text style={styles.error}>{completeError}</Text>
              <Pressable onPress={() => void finish(progress)} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Try again</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            disabled={completing}
            onPress={() => {
              tapHaptic();
              onComplete();
            }}
            style={({ pressed }) => [styles.primaryButton, (pressed || completing) && styles.buttonPressed]}
          >
            {completing ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text style={styles.primaryText}>Go to Today</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    content: {
      gap: 16,
      padding: 18,
      paddingBottom: 40,
    },
    loading: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    header: {
      gap: 8,
    },
    eyebrow: {
      ...theme.text("monoLabel", "teal"),
    },
    title: {
      ...theme.text("displayLg", "ink"),
    },
    body: {
      ...theme.text("bodyLg", "inkMuted"),
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 16,
    },
    panelTitle: {
      ...theme.text("heading", "ink"),
    },
    panelBody: {
      ...theme.text("body", "inkMuted"),
    },
    courseRow: {
      borderTopColor: colors.line,
      borderTopWidth: 1,
      gap: 2,
      paddingTop: 8,
    },
    courseName: {
      ...theme.text("label", "ink"),
    },
    navRow: {
      flexDirection: "row",
      gap: 10,
    },
    error: {
      ...theme.text("body", "danger"),
    },
    notice: {
      ...theme.text("label", "teal"),
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      padding: 10,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 14,
    },
    flexButton: {
      flex: 1,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 20,
    },
    secondaryText: {
      ...theme.text("body", "ink"),
    },
    linkButton: {
      alignItems: "center",
      paddingVertical: 6,
    },
    linkText: {
      ...theme.text("body", "inkMuted"),
      textDecorationLine: "underline",
    },
    buttonPressed: {
      opacity: 0.78,
    },
    primaryText: {
      ...theme.text("heading", "surface"),
    },
  });
}
