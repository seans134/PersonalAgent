import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  isCheckoffForToday,
  localPlanDate,
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

const STALE_PLAN_NOTICE = "This plan is from a previous day. Pull down to generate a fresh plan first.";

/** Judged in the profile timezone the server dated the plan in; plans cached before check-off use the generated day. */
function isPlanForToday(plan: MobileTodayPlanResponse): boolean {
  if (plan.checkoff) return isCheckoffForToday(plan.checkoff);
  return localPlanDate(null, new Date(plan.meta.generatedAt)) === localPlanDate();
}

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
  const [planCacheMessage, setPlanCacheMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);
  const [courses, setCourses] = useState<MobileCourseSummary[] | null>(null);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  // planRef is the latest plan, so concurrent check-offs update and cache from current
  // state rather than from the snapshot their handler closed over.
  const planRef = useRef<MobileTodayPlanResponse | null>(null);
  const pendingKeysRef = useRef(new Set<string>());
  const acceptingRef = useRef(false);

  const replacePlan = useCallback((next: MobileTodayPlanResponse | null) => {
    planRef.current = next;
    setPlan(next);
  }, []);

  /** Applies update to the latest plan, only while it is still the plan generated at generatedAt. */
  const updateCurrentPlan = useCallback(
    (generatedAt: string, update: (current: MobileTodayPlanResponse) => MobileTodayPlanResponse) => {
      const current = planRef.current;
      if (!current || current.meta.generatedAt !== generatedAt) return false;
      replacePlan(update(current));
      return true;
    },
    [replacePlan],
  );

  /** The offline cache is best-effort: a failed write never undoes a saved check-off. */
  const persistPlan = useCallback(async () => {
    const current = planRef.current;
    if (!current) return;
    try {
      await writeCachedTodayPlan(current);
    } catch {
      // Keep going; the server has the marks.
    }
  }, []);

  function setKeyPending(key: string, pending: boolean) {
    if (pending) pendingKeysRef.current.add(key);
    else pendingKeysRef.current.delete(key);
    setPendingKeys(new Set(pendingKeysRef.current));
  }

  const now = new Date();
  const greeting = greetingFor(now);
  const dateLabel = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const loadCachedPlan = useCallback(async () => {
    const cachedPlan = await readCachedTodayPlan();
    if (!cachedPlan) return;

    const cached = cachedPlan.value;
    // The cache is rewritten on every check-off, so its savedAt is not when the plan was made.
    const generatedAt = new Date(cached.meta.generatedAt);
    const isFromToday = isPlanForToday(cached);

    replacePlan(cached);
    setPlanCacheMessage(
      isFromToday
        ? `Saved plan from ${generatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : `This plan is from ${generatedAt.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}. Pull down to generate a fresh plan for today.`,
    );

    // Pick up check-offs made elsewhere (e.g. on the web) since this plan was cached.
    const checkoff = cached.checkoff;
    if (!isFromToday || !checkoff) return;
    try {
      const saved = await fetchMobilePlanStatus(accessToken, checkoff.planDate);
      // Dropped if the plan was regenerated meanwhile; keys with a write in flight keep the local mark.
      const synced = updateCurrentPlan(cached.meta.generatedAt, (current) => {
        const statuses = { ...saved.statuses };
        for (const item of current.plan.items) {
          if (!item.key || !pendingKeysRef.current.has(item.key)) continue;
          if (item.status) statuses[item.key] = item.status;
          else delete statuses[item.key];
        }
        return {
          ...withItems(current, mergePlanItemStatuses(current.plan.items, statuses)),
          checkoff: { ...checkoff, acceptedAt: saved.acceptedAt ?? current.checkoff?.acceptedAt ?? null },
        };
      });
      if (synced) await persistPlan();
    } catch {
      // Offline: keep the cached marks.
    }
  }, [accessToken, persistPlan, replacePlan, updateCurrentPlan]);

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
      replacePlan(nextPlan);
      setPlanCacheMessage("Saved for offline viewing.");
      successHaptic();
      await persistPlan();
    } catch (generateError) {
      errorHaptic();
      setError(generateError instanceof Error ? generateError.message : "Unable to generate today plan.");
    }
  }, [accessToken, persistPlan, replacePlan]);

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

  async function handleCheckoff(item: PlannedItem, tapped: PlanItemStatus) {
    const current = planRef.current;
    if (!current?.checkoff || !item.key || pendingKeysRef.current.has(item.key)) return;
    // Re-checked at tap time: the day may have rolled over since the plan was shown.
    if (!isPlanForToday(current)) {
      setNotice(STALE_PLAN_NOTICE);
      return;
    }
    const key = item.key;
    const generatedAt = current.meta.generatedAt;
    const previous = current.plan.items.find((entry) => entry.key === key)?.status ?? null;
    const status = nextPlanItemStatus(previous, tapped);
    const setStatus = (value: PlanItemStatus | null) =>
      updateCurrentPlan(generatedAt, (latest) => withItems(latest, applyPlanItemStatus(latest.plan.items, key, value)));

    setError(undefined);
    setKeyPending(key, true);
    tapHaptic();
    setStatus(status);
    let saved = false;
    try {
      await setMobilePlanItemStatus(
        accessToken,
        { planDate: current.checkoff.planDate, itemKey: key, itemType: item.type, status },
        planCheckoffCounts(planRef.current?.plan.items ?? []),
      );
      saved = true;
    } catch (checkoffError) {
      errorHaptic();
      // Roll back only this item, on the plan it was made on.
      setStatus(previous);
      setError(checkoffError instanceof Error ? checkoffError.message : "Unable to save check-off.");
    }
    setKeyPending(key, false);
    if (saved) await persistPlan();
  }

  async function handleAccept() {
    const current = planRef.current;
    if (!current?.checkoff || acceptingRef.current) return;
    if (!isPlanForToday(current)) {
      setNotice(STALE_PLAN_NOTICE);
      return;
    }
    const generatedAt = current.meta.generatedAt;
    setError(undefined);
    acceptingRef.current = true;
    setAccepting(true);
    let saved = false;
    try {
      const result = await acceptMobilePlan(accessToken, current.checkoff.planDate, planCheckoffCounts(current.plan.items));
      successHaptic();
      updateCurrentPlan(generatedAt, (latest) => ({
        ...latest,
        checkoff: latest.checkoff ? { ...latest.checkoff, acceptedAt: result.acceptedAt } : latest.checkoff,
      }));
      saved = true;
    } catch (acceptError) {
      errorHaptic();
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept plan.");
    }
    acceptingRef.current = false;
    setAccepting(false);
    if (saved) await persistPlan();
  }

  const planIsStale = plan ? !isPlanForToday(plan) : false;

  async function scheduleReminders() {
    setError(undefined);
    setNotice(undefined);

    if (planIsStale) {
      setNotice(STALE_PLAN_NOTICE);
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
  // Check-off needs a plan dated today; older or pre-check-off cached plans show read-only.
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
              pendingKeys={pendingKeys}
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
