import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { buildExamReminders, examLabel } from "@personal-agent/core";
import type { MobileCourseSummary, MobileWorkoutScheduleItem } from "./api";
import { captureEvent } from "./analytics";

const PREFERENCES_KEY = "atlas.notification-preferences.v1";
const IDENTIFIERS_KEY = "atlas.notification-identifiers.v1";
const CHANNEL_ID = "atlas-reminders";
// Kept apart from IDENTIFIERS_KEY so exam syncs never race plan-reminder writes to the same record.
const EXAM_IDENTIFIERS_KEY = "atlas.exam-notification-identifiers.v1";
// Set once Atlas has asked for permission on its own for exam reminders, so it never asks again unprompted.
const EXAM_PERMISSION_ASKED_KEY = "atlas.exam-reminder-permission-asked.v1";
// Exam reminders carry this identifier prefix and data.kind so they can be replaced without touching plan reminders.
const EXAM_IDENTIFIER_PREFIX = "atlas-exam-";
const EXAM_REMINDER_KIND = "examReminder";

type NotificationGroup = "dailyPlan" | "workouts" | "todayPlan";
type StoredIdentifiers = Record<NotificationGroup, string[]>;

export type NotificationPreferences = {
  dailyPlanEnabled: boolean;
  dailyPlanTime: string;
  workoutEnabled: boolean;
  workoutTime: string;
  planLeadMinutes: number;
  examRemindersEnabled: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  dailyPlanEnabled: false,
  dailyPlanTime: "08:00",
  workoutEnabled: false,
  workoutTime: "17:00",
  planLeadMinutes: 10,
  examRemindersEnabled: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;
  if (!match || hour > 23 || minute > 59) {
    throw new Error("Reminder time must use HH:MM format.");
  }
  return { hour, minute };
}

async function readIdentifiers(): Promise<StoredIdentifiers> {
  const raw = await AsyncStorage.getItem(IDENTIFIERS_KEY);
  if (!raw) return { dailyPlan: [], workouts: [], todayPlan: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredIdentifiers>;
    return {
      dailyPlan: parsed.dailyPlan ?? [],
      workouts: parsed.workouts ?? [],
      todayPlan: parsed.todayPlan ?? [],
    };
  } catch {
    return { dailyPlan: [], workouts: [], todayPlan: [] };
  }
}

async function writeIdentifiers(identifiers: StoredIdentifiers) {
  await AsyncStorage.setItem(IDENTIFIERS_KEY, JSON.stringify(identifiers));
}

async function replaceGroup(group: NotificationGroup, identifiers: string[]) {
  const stored = await readIdentifiers();
  await Promise.all(stored[group].map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  stored[group] = identifiers;
  await writeIdentifiers(stored);
}

async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Atlas reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }
}

export async function ensureNotificationPermissions() {
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

export async function readNotificationPreferences() {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return defaultNotificationPreferences;

  try {
    return { ...defaultNotificationPreferences, ...(JSON.parse(raw) as Partial<NotificationPreferences>) };
  } catch {
    return defaultNotificationPreferences;
  }
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
  workoutPlan: MobileWorkoutScheduleItem[],
) {
  parseTime(preferences.dailyPlanTime);
  parseTime(preferences.workoutTime);
  if (!Number.isInteger(preferences.planLeadMinutes) || preferences.planLeadMinutes < 0 || preferences.planLeadMinutes > 120) {
    throw new Error("Plan reminder lead time must be between 0 and 120 minutes.");
  }

  if (preferences.dailyPlanEnabled || preferences.workoutEnabled) {
    const permitted = await ensureNotificationPermissions();
    if (!permitted) throw new Error("Notifications are disabled for Atlas in device settings.");
  } else if (preferences.examRemindersEnabled) {
    // Exam reminders are on by default, so a denial here shouldn't block saving other settings.
    await ensureNotificationPermissions();
  }

  const dailyIds: string[] = [];
  if (preferences.dailyPlanEnabled) {
    const { hour, minute } = parseTime(preferences.dailyPlanTime);
    dailyIds.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: "Plan today's study time",
        body: "Open Atlas to build or review today's study plan.",
        data: { screen: "dashboard" },
        sound: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
    }));
  }
  await replaceGroup("dailyPlan", dailyIds);

  const workoutIds: string[] = [];
  if (preferences.workoutEnabled) {
    const { hour, minute } = parseTime(preferences.workoutTime);
    const plannedDays = [...new Set(workoutPlan.map((item) => item.day_of_week))];
    for (const day of plannedDays) {
      workoutIds.push(await Notifications.scheduleNotificationAsync({
        content: {
          title: "Workout planned today",
          body: "Open Atlas to review and track today's training.",
          data: { screen: "workouts" },
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day === 7 ? 1 : day + 1,
          hour,
          minute,
          channelId: CHANNEL_ID,
        },
      }));
    }
  }
  await replaceGroup("workouts", workoutIds);
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  // Turning exam reminders on is handled by the caller re-syncing from course summaries.
  if (!preferences.examRemindersEnabled) await cancelExamReminders();
  captureEvent("notification_preferences_updated", {
    daily_plan_enabled: preferences.dailyPlanEnabled,
    workout_enabled: preferences.workoutEnabled,
    exam_reminders_enabled: preferences.examRemindersEnabled,
  });

  return dailyIds.length + workoutIds.length;
}

export async function scheduleTodayPlanReminders(
  items: Array<{ startTime: string }>,
  leadMinutes: number,
) {
  const permitted = await ensureNotificationPermissions();
  if (!permitted) throw new Error("Notifications are disabled for Atlas in device settings.");

  const now = new Date();
  const identifiers: string[] = [];
  for (const item of items) {
    const { hour, minute } = parseTime(item.startTime);
    const reminderDate = new Date(now);
    reminderDate.setHours(hour, minute, 0, 0);
    reminderDate.setMinutes(reminderDate.getMinutes() - leadMinutes);
    if (reminderDate <= now) continue;

    identifiers.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your next plan item is coming up",
        body: leadMinutes === 0 ? "Open Atlas to begin." : `It starts in ${leadMinutes} minutes.`,
        data: { screen: "dashboard" },
        sound: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate, channelId: CHANNEL_ID },
    }));
  }

  await replaceGroup("todayPlan", identifiers);
  captureEvent("today_plan_reminders_scheduled", { count: identifiers.length, lead_minutes: leadMinutes });
  return identifiers.length;
}

export async function notificationsPermitted() {
  return (await Notifications.getPermissionsAsync()).status === "granted";
}

// Defaults with every reminder off; exam reminders default on, so "disable all" must switch them off explicitly.
export const disabledNotificationPreferences: NotificationPreferences = {
  ...defaultNotificationPreferences,
  examRemindersEnabled: false,
};

async function cancelScheduledAtlasNotifications() {
  await cancelExamReminders();
  const stored = await readIdentifiers();
  await Promise.all(Object.values(stored).flat().map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await writeIdentifiers({ dailyPlan: [], workouts: [], todayPlan: [] });
}

// "Disable All Reminders": cancels everything and saves every reminder as off.
export async function cancelAllAtlasNotifications() {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(disabledNotificationPreferences));
  await cancelScheduledAtlasNotifications();
  captureEvent("notifications_disabled");
  return disabledNotificationPreferences;
}

// Account deletion: cancels everything and resets preferences to defaults, so the next account
// on this device starts with exam reminders on rather than inheriting a disabled state.
export async function resetAtlasNotifications() {
  endExamReminderSession();
  await AsyncStorage.removeItem(PREFERENCES_KEY);
  await cancelScheduledAtlasNotifications();
  return defaultNotificationPreferences;
}

// Bumped on sign-out. A sync carries the generation from when its course load started, and is
// skipped if the student signed out since, so a refresh finishing late can't reschedule reminders.
let examReminderSession = 0;

export function currentExamReminderSession() {
  return examReminderSession;
}

export function endExamReminderSession() {
  examReminderSession += 1;
}

// Exam reminders are rebuilt from scratch on every sync. Syncs run one at a time so two overlapping
// course loads can't each schedule a set and leave duplicates behind.
let examQueue: Promise<unknown> = Promise.resolve();

function enqueueExamTask<T>(task: () => Promise<T>): Promise<T> {
  const run = examQueue.then(task);
  examQueue = run.catch(() => undefined);
  return run;
}

async function readExamIdentifiers(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(EXAM_IDENTIFIERS_KEY)) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function cancelExamRemindersNow() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set(await readExamIdentifiers());
  for (const request of scheduled) {
    if (request.identifier.startsWith(EXAM_IDENTIFIER_PREFIX) || request.content.data?.kind === EXAM_REMINDER_KIND) {
      ids.add(request.identifier);
    }
  }
  await Promise.all([...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await AsyncStorage.setItem(EXAM_IDENTIFIERS_KEY, JSON.stringify([]));
}

export function cancelExamReminders() {
  return enqueueExamTask(cancelExamRemindersNow);
}

// Granted already, or still undetermined and Atlas hasn't asked on its own before. A denial is never re-prompted
// here; the student can re-enable notifications in device settings or by saving notification settings.
async function examRemindersPermitted() {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") {
    await ensureAndroidChannel();
    return true;
  }
  if (existing.status !== "undetermined" || !existing.canAskAgain) return false;
  if (await AsyncStorage.getItem(EXAM_PERMISSION_ASKED_KEY)) return false;
  await AsyncStorage.setItem(EXAM_PERMISSION_ASKED_KEY, "1");
  return ensureNotificationPermissions();
}

// Replaces the scheduled exam reminders with ones for each active course's next exam:
// 3 days and 1 day before, at 9:00 device-local time. Returns how many were scheduled.
export function syncExamReminders(courses: MobileCourseSummary[], session = examReminderSession) {
  return enqueueExamTask(async () => {
    if (session !== examReminderSession) return 0;
    const preferences = await readNotificationPreferences();
    if (!preferences.examRemindersEnabled) {
      await cancelExamRemindersNow();
      return 0;
    }

    const exams = courses.flatMap((course) =>
      course.archivedAt === null && course.nextExam
        ? [{ id: course.nextExam.id, courseId: course.id, label: examLabel(course, course.nextExam.title), dueAt: course.nextExam.dueAt }]
        : [],
    );
    // No timeZone: reminder days and the 9:00 time use the device's local time.
    const reminders = buildExamReminders(exams, new Date());
    if (reminders.length === 0) {
      await cancelExamRemindersNow();
      return 0;
    }
    if (!(await examRemindersPermitted())) return 0;
    // The permission prompt can sit open across a sign-out.
    if (session !== examReminderSession) return 0;

    await cancelExamRemindersNow();
    const identifiers: string[] = [];
    for (const reminder of reminders) {
      identifiers.push(await Notifications.scheduleNotificationAsync({
        identifier: `${EXAM_IDENTIFIER_PREFIX}${reminder.examId}-${reminder.daysBefore}d`,
        content: {
          title: reminder.title,
          body: reminder.body,
          data: { kind: EXAM_REMINDER_KIND, screen: "course", courseId: reminder.courseId, examId: reminder.examId },
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.fireAt),
          channelId: CHANNEL_ID,
        },
      }));
    }
    await AsyncStorage.setItem(EXAM_IDENTIFIERS_KEY, JSON.stringify(identifiers));
    captureEvent("exam_reminders_scheduled", { count: identifiers.length });
    return identifiers.length;
  });
}

export async function getAtlasScheduledNotificationCount() {
  const [stored, exams] = await Promise.all([readIdentifiers(), readExamIdentifiers()]);
  return Object.values(stored).flat().length + exams.length;
}
