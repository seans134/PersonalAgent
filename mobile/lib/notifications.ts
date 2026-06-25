import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { MobileWorkoutScheduleItem } from "./api";
import { captureEvent } from "./analytics";

const PREFERENCES_KEY = "atlas.notification-preferences.v1";
const IDENTIFIERS_KEY = "atlas.notification-identifiers.v1";
const CHANNEL_ID = "atlas-reminders";

type NotificationGroup = "dailyPlan" | "workouts" | "todayPlan";
type StoredIdentifiers = Record<NotificationGroup, string[]>;

export type NotificationPreferences = {
  dailyPlanEnabled: boolean;
  dailyPlanTime: string;
  workoutEnabled: boolean;
  workoutTime: string;
  planLeadMinutes: number;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  dailyPlanEnabled: false,
  dailyPlanTime: "08:00",
  workoutEnabled: false,
  workoutTime: "17:00",
  planLeadMinutes: 10,
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
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("Reminder time must use HH:MM format.");
  return { hour: Number(match[1]), minute: Number(match[2]) };
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

export async function ensureNotificationPermissions() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Atlas reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

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
  }

  const dailyIds: string[] = [];
  if (preferences.dailyPlanEnabled) {
    const { hour, minute } = parseTime(preferences.dailyPlanTime);
    dailyIds.push(await Notifications.scheduleNotificationAsync({
      content: {
        title: "Plan your day with Atlas",
        body: "Generate or review today's plan.",
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
  captureEvent("notification_preferences_updated", {
    daily_plan_enabled: preferences.dailyPlanEnabled,
    workout_enabled: preferences.workoutEnabled,
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

export async function cancelAllAtlasNotifications() {
  const stored = await readIdentifiers();
  await Promise.all(Object.values(stored).flat().map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await writeIdentifiers({ dailyPlan: [], workouts: [], todayPlan: [] });
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(defaultNotificationPreferences));
  captureEvent("notifications_disabled");
}

export async function getAtlasScheduledNotificationCount() {
  const stored = await readIdentifiers();
  return Object.values(stored).flat().length;
}
