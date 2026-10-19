import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  applyPlanItemStatus,
  examLabel,
  examsWithinDays,
  features,
  formatDaysAway,
  mergePlanItemStatuses,
  nextPlanItemStatus,
  planCheckoffCounts,
  type PlannedItem,
  type PlanItemStatus,
} from "@personal-agent/core";
import {
  acceptMobilePlan,
  fetchMobileCourses,
  fetchMobilePlanStatus,
  generateMobileTodayPlan,
  setMobilePlanItemStatus,
  type MobileCourseSummary,
  type MobileTodayPlanResponse,
} from "../lib/api";
import { readCachedTodayPlan, writeCachedTodayPlan } from "../lib/cache";
import { errorHaptic, successHaptic, tapHaptic } from "../lib/haptics";
import { readNotificationPreferences, scheduleTodayPlanReminders } from "../lib/notifications";
import { useTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { TodayPlanTimeline } from "./TodayPlanTimeline";

type DashboardScreenProps = {
  accessToken: string;
  onOpenCourse: (courseId: string) => void;
  onOpenCourses: () => void;
};

const legendKeys = [
  { key: "goal", label: "Goal" },
  { key: "focus", label: "Study" },
  { key: "fitness", label: "Fitness" },
  { key: "wellness", label: "Wellness" },
  { key: "commit", label: "Fixed" },
] as const;

// Fitness and wellness items only appear while wellness tracking is on.
const visibleLegendKeys = features.wellnessTracking
  ? legendKeys
  : legendKeys.filter((entry) => entry.key !== "fitness" && entry.key !== "wellness");

function formatGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const UPCOMING_EXAM_DAYS = 14;

function withItems(plan: MobileTodayPlanResponse, items: PlannedItem[]): MobileTodayPlanResponse {
  return { ...plan, plan: { ...plan.plan, items } };
}

function formatAcceptedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardScreen({ accessToken, onOpenCourse, onOpenCourses }: DashboardScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { colors } = theme;

  const [plan, setPlan] = useState<MobileTodayPlanResponse | null>(null);
  const [planIsStale, setPlanIsStale] = useState(false);
  const [planCacheMessage, setPlanCacheMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);
  const [courses, setCourses] = useState<MobileCourseSummary[] | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const now = new Date();
  const greeting = greetingFor(now);
  const dateLabel = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const loadCachedPlan = useCallback(async () => {
    const cachedPlan = await readCachedTodayPlan();
    if (!cachedPlan) return;

    const savedAt = new Date(cachedPlan.savedAt);
    const isFromToday = savedAt.toDateString() === new Date().toDateString();

    setPlan(cachedPlan.value);
    setPlanIsStale(!isFromToday);
    setPlanCacheMessage(
      isFromToday
        ? `Saved plan from ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : `This plan is from ${savedAt.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}. Pull down to generate a fresh plan for today.`,
    );

    // Pick up check-offs made elsewhere (e.g. on the web) since this plan was cached.
    const checkoff = cachedPlan.value.checkoff;
    if (!isFromToday || !checkoff) return;
    try {
      const saved = await fetchMobilePlanStatus(accessToken, checkoff.planDate);
      const synced: MobileTodayPlanResponse = {
        ...withItems(cachedPlan.value, mergePlanItemStatuses(cachedPlan.value.plan.items, saved.statuses)),
        checkoff: { planDate: checkoff.planDate, acceptedAt: saved.acceptedAt },
      };
      setPlan(synced);
      await writeCachedTodayPlan(synced);
    } catch {
      // Offline: keep the cached marks.
    }
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCachedPlan();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCachedPlan]);

  const loadCourses = useCallback(async () => {
    try {
      const response = await fetchMobileCourses(accessToken);
      setCourses(response.courses);
    } catch {
      // Today still works without the course summary; keep whatever was shown.
    }
  }, [accessToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadCourses();
    }, 0);

    return () => clearTimeout(timeout);
  }, [loadCourses]);

  const generatePlan = useCallback(async () => {
    setError(undefined);
    setNotice(undefined);

    try {
      const nextPlan = await generateMobileTodayPlan(accessToken);
      setPlan(nextPlan);
      setPlanIsStale(false);
      setPlanCacheMessage("Saved for offline viewing.");
      successHaptic();
      await writeCachedTodayPlan(nextPlan);
    } catch (generateError) {
      errorHaptic();
      setError(generateError instanceof Error ? generateError.message : "Unable to generate today plan.");
    }
  }, [accessToken]);

  async function handleGeneratePress() {
    setGeneratingPlan(true);
    await generatePlan();
    setGeneratingPlan(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([generatePlan(), loadCourses()]);
    setRefreshing(false);
  }

  async function updatePlan(next: MobileTodayPlanResponse) {
    setPlan(next);
    await writeCachedTodayPlan(next);
  }

  async function handleCheckoff(item: PlannedItem, tapped: PlanItemStatus) {
    if (!plan?.checkoff || !item.key || planIsStale) return;
    const key = item.key;
    const status = nextPlanItemStatus(item.status, tapped);
    const nextItems = applyPlanItemStatus(plan.plan.items, key, status);
    setError(undefined);
    setPendingKey(key);
    tapHaptic();
    setPlan(withItems(plan, nextItems));
    try {
      await setMobilePlanItemStatus(
        accessToken,
        { planDate: plan.checkoff.planDate, itemKey: key, itemType: item.type, status },
        planCheckoffCounts(nextItems),
      );
      await writeCachedTodayPlan(withItems(plan, nextItems));
    } catch (checkoffError) {
      errorHaptic();
      setPlan(plan);
      setError(checkoffError instanceof Error ? checkoffError.message : "Unable to save check-off.");
    }
    setPendingKey(null);
  }

  async function handleAccept() {
    if (!plan?.checkoff || planIsStale) return;
    setError(undefined);
    setAccepting(true);
    try {
      const result = await acceptMobilePlan(accessToken, plan.checkoff.planDate, planCheckoffCounts(plan.plan.items));
      successHaptic();
      await updatePlan({ ...plan, checkoff: { ...plan.checkoff, acceptedAt: result.acceptedAt } });
    } catch (acceptError) {
      errorHaptic();
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept plan.");
    }
    setAccepting(false);
  }

  async function scheduleReminders() {
    setError(undefined);
    setNotice(undefined);

    if (planIsStale) {
      setNotice("This plan is from a previous day. Pull down to generate a fresh plan first.");
      return;
    }

    setSchedulingReminder(true);

    try {
      const preferences = await readNotificationPreferences();
      const count = await scheduleTodayPlanReminders(
        (plan?.plan.items ?? []).filter((item) => !item.status),
        preferences.planLeadMinutes,
      );
      setNotice(
        count > 0
          ? `${count} reminder${count === 1 ? "" : "s"} scheduled for today's remaining plan.`
          : "No future plan items are available to remind you about.",
      );
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : "Unable to schedule reminder.");
    }

    setSchedulingReminder(false);
  }

  // Day counts use the device's local calendar.
  const upcomingExams = courses
    ? examsWithinDays(
        courses.flatMap((course) => (course.nextExam ? [{ ...course.nextExam, course }] : [])),
        now,
        UPCOMING_EXAM_DAYS,
      )
    : [];

  const hasPlanContent =
    plan !== null && (plan.plan.items.length > 0 || plan.contextEvents.length > 0);
  // Check-off needs a plan dated today by the server; older or stale cached plans show read-only.
  const checkoff = plan && !planIsStale ? plan.checkoff : undefined;
  const counts = plan ? planCheckoffCounts(plan.plan.items) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.teal}
          colors={[colors.teal]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={theme.text("monoLabel", "teal")}>{dateLabel}</Text>
        <Text style={theme.text("displayXl", "ink")}>{greeting}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={theme.text("body", "danger")}>{error}</Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.noticeBanner}>
          <Text style={theme.text("label", "teal")}>{notice}</Text>
        </View>
      ) : null}

      {upcomingExams.length > 0 ? (
        <View style={[styles.card, styles.coursesCard]}>
          <Text style={theme.text("title", "ink")}>Upcoming exams</Text>
          {upcomingExams.map((exam, index) => (
            <Pressable
              key={exam.id}
              onPress={() => onOpenCourse(exam.course.id)}
              style={({ pressed }) => [
                styles.courseRow,
                index < upcomingExams.length - 1 && styles.courseRowDivider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.courseCopy}>
                <Text numberOfLines={1} style={theme.text("heading", "ink")}>{examLabel(exam.course, exam.title)}</Text>
                <Text numberOfLines={1} style={theme.text("body", "inkMuted")}>
                  {`${exam.course.name} · ${formatShortDate(exam.dueAt)}`}
                </Text>
              </View>
              <Text style={theme.text("monoLabel", "teal")}>{formatDaysAway(exam.daysAway)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!plan ? (
        <View style={[styles.card, styles.heroCard]}>
          <Text style={theme.text("title", "ink")}>Plan today&apos;s study time</Text>
          <Text style={[theme.text("body", "inkMuted"), styles.heroBody]}>
            Atlas fits study time around your classes, deadlines, and exams.
          </Text>
          <Pressable
            disabled={generatingPlan}
            onPress={handleGeneratePress}
            style={({ pressed }) => [styles.primaryButton, (pressed || generatingPlan) && styles.pressed]}
          >
            {generatingPlan ? (
              <ActivityIndicator color={colors.onTeal} />
            ) : (
              <Text style={theme.text("heading", "onTeal")}>Plan my day</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {plan ? (
        <View style={styles.planSection}>
          <View style={styles.statRow}>
            <StatTile theme={theme} styles={styles} label="Blocks" value={plan.plan.items.length} />
            <StatTile theme={theme} styles={styles} label="Goals used" value={plan.meta.goalsCount} />
            <StatTile theme={theme} styles={styles} label="Events" value={plan.meta.eventsCount} />
          </View>

          {planCacheMessage ? (
            <Text style={[theme.text("label", "teal"), planIsStale && styles.cacheMessageStale]}>
              {planCacheMessage}
            </Text>
          ) : null}

          {plan.summary ? (
            <View style={styles.summaryCard}>
              <Text style={theme.text("body", "ink")}>{plan.summary}</Text>
            </View>
          ) : null}
          {plan.plan.explanation ? (
            <Text style={theme.text("body", "inkMuted")}>{plan.plan.explanation}</Text>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={theme.text("title", "ink")}>Today&apos;s plan</Text>
            <View style={styles.legendRow}>
              {visibleLegendKeys.map((entry) => (
                <View key={entry.key} style={styles.legendItem}>
                  <View style={[styles.legendNode, { backgroundColor: colors[entry.key] }]} />
                  <Text style={theme.text("monoTime", "inkMuted")}>{entry.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {checkoff && counts && counts.item_count > 0 ? (
            <View style={styles.checkoffCard}>
              <Text style={theme.text("label", "ink")}>
                {`${counts.done_count} of ${counts.item_count} done`}
                {counts.skipped_count > 0 ? ` · ${counts.skipped_count} skipped` : ""}
              </Text>
              {checkoff.acceptedAt ? (
                <Text style={theme.text("monoLabel", "teal")}>{`Committed at ${formatAcceptedAt(checkoff.acceptedAt)}`}</Text>
              ) : (
                <Pressable
                  disabled={accepting}
                  onPress={handleAccept}
                  style={({ pressed }) => [styles.commitButton, (pressed || accepting) && styles.pressed]}
                >
                  {accepting ? (
                    <ActivityIndicator color={colors.teal} />
                  ) : (
                    <Text style={theme.text("heading", "teal")}>Commit to this plan</Text>
                  )}
                </Pressable>
              )}
            </View>
          ) : null}

          {hasPlanContent ? (
            <TodayPlanTimeline
              contextEvents={plan.contextEvents}
              items={plan.plan.items}
              onCheckoff={checkoff ? handleCheckoff : undefined}
              pendingKey={pendingKey}
            />
          ) : (
            <View style={[styles.card, styles.emptyDay]}>
              <Text style={theme.text("body", "inkMuted")}>Nothing planned for today yet. Plan your day to see when to study.</Text>
            </View>
          )}

          {plan.meta.warnings.length > 0 ? (
            <View style={styles.warningCard}>
              {plan.meta.warnings.map((warning) => (
                <Text key={warning} style={theme.text("body", "warning")}>
                  {warning}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              disabled={generatingPlan}
              onPress={handleGeneratePress}
              style={({ pressed }) => [styles.secondaryAction, (pressed || generatingPlan) && styles.pressed]}
            >
              {generatingPlan ? (
                <ActivityIndicator color={colors.teal} />
              ) : (
                <Text style={theme.text("heading", "teal")}>Regenerate</Text>
              )}
            </Pressable>
            <Pressable
              disabled={schedulingReminder}
              onPress={scheduleReminders}
              style={({ pressed }) => [styles.primaryButton, styles.actionFlex, (pressed || schedulingReminder) && styles.pressed]}
            >
              {schedulingReminder ? (
                <ActivityIndicator color={colors.onTeal} />
              ) : (
                <Text style={theme.text("heading", "onTeal")}>Schedule reminders</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      {courses ? (
        <View style={[styles.card, styles.coursesCard]}>
          <View style={styles.coursesHeader}>
            <Text style={theme.text("title", "ink")}>Your courses</Text>
            <Pressable hitSlop={8} onPress={onOpenCourses}>
              <Text style={theme.text("label", "teal")}>{courses.length > 0 ? "All courses" : "Add a course"}</Text>
            </Pressable>
          </View>
          {courses.length > 0 ? (
            courses.map((course, index) => (
              <Pressable
                key={course.id}
                onPress={() => onOpenCourse(course.id)}
                style={({ pressed }) => [
                  styles.courseRow,
                  index < courses.length - 1 && styles.courseRowDivider,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.courseCopy}>
                  <Text numberOfLines={1} style={theme.text("heading", "ink")}>{course.name}</Text>
                  <Text numberOfLines={1} style={theme.text("body", "inkMuted")}>
                    {course.nextItem
                      ? `Next: ${course.nextItem.title} · ${formatShortDate(course.nextItem.dueAt)}`
                      : "Nothing due yet"}
                  </Text>
                </View>
                <View style={styles.courseStats}>
                  <Text style={theme.text("heading", "ink")}>{formatGrade(course.average)}</Text>
                  {course.dueThisWeek > 0 ? (
                    <Text style={theme.text("monoLabel", "teal")}>{course.dueThisWeek} due this week</Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={theme.text("body", "inkMuted")}>
              Add your courses to see grades and what&apos;s due, and to get study time in your plan.
            </Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  theme,
  styles,
}: {
  label: string;
  value: number;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={theme.text("displayLg", "teal")}>{value}</Text>
      <Text style={theme.text("monoLabel", "inkMuted")}>{label}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, space, radius, shadow } = theme;
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.paper,
    },
    content: {
      gap: space.base,
      padding: space.lg,
      paddingBottom: space["4xl"],
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
      padding: space.lg,
      ...shadow.sm,
    },
    heroCard: {
      gap: space.md,
    },
    coursesCard: {
      gap: space.sm,
    },
    coursesHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    courseRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: space.md,
      paddingVertical: space.sm,
    },
    courseRowDivider: {
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
    },
    courseCopy: {
      flex: 1,
      gap: 2,
    },
    courseStats: {
      alignItems: "flex-end",
      gap: 2,
    },
    heroBody: {
      marginBottom: space.xs,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.teal,
      borderRadius: radius.control,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: space.base,
    },
    pressed: {
      opacity: 0.82,
    },
    errorBanner: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      padding: space.md,
    },
    noticeBanner: {
      backgroundColor: colors.surface,
      borderColor: colors.teal,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      padding: space.md,
    },
    planSection: {
      gap: space.md,
    },
    statRow: {
      flexDirection: "row",
      gap: space.sm,
    },
    statTile: {
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      flex: 1,
      gap: space.xs,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      ...shadow.sm,
    },
    cacheMessageStale: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
      borderRadius: radius.control,
      borderWidth: 1,
      color: colors.warning,
      overflow: "hidden",
      padding: space.sm,
    },
    summaryCard: {
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderLeftColor: colors.teal,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: space.md,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
      justifyContent: "space-between",
      marginTop: space.xs2,
    },
    legendRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.md,
    },
    legendItem: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    legendNode: {
      borderRadius: 2,
      height: 9,
      width: 9,
      transform: [{ rotate: "45deg" }],
    },
    emptyDay: {
      alignItems: "center",
    },
    warningCard: {
      backgroundColor: colors.surface,
      borderColor: colors.warning,
      borderLeftWidth: 3,
      borderWidth: 1,
      borderRadius: radius.control,
      gap: space.xs,
      padding: space.md,
    },
    actionRow: {
      flexDirection: "row",
      gap: space.sm,
      marginTop: space.xs2,
    },
    secondaryAction: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: space.lg,
    },
    actionFlex: {
      flex: 1,
    },
    checkoffCard: {
      alignItems: "center",
      backgroundColor: colors.surface2,
      borderColor: colors.line,
      borderRadius: radius.card,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: space.sm,
      justifyContent: "space-between",
      padding: space.md,
    },
    commitButton: {
      alignItems: "center",
      borderColor: colors.teal,
      borderRadius: radius.control,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 40,
      paddingHorizontal: space.base,
    },
  });
}
