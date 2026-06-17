import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationPermissions() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("atlas-reminders", {
      name: "Atlas reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

export async function schedulePlanReminder() {
  const hasPermission = await ensureNotificationPermissions();

  if (!hasPermission) {
    throw new Error("Notifications are disabled for Atlas.");
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Atlas plan check",
      body: "Take a look at your next action for today.",
      data: { screen: "dashboard" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60 * 60,
    },
  });
}
