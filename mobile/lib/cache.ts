import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileCalendarResponse, MobileTodayPlanResponse } from "./api";

type CachedEnvelope<T> = {
  savedAt: string;
  value: T;
};

const cacheKeys = {
  calendar: "atlas.cache.calendar",
  todayPlan: "atlas.cache.todayPlan",
};

async function readCache<T>(key: string): Promise<CachedEnvelope<T> | null> {
  const raw = await AsyncStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CachedEnvelope<T>;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

async function writeCache<T>(key: string, value: T) {
  const envelope: CachedEnvelope<T> = {
    savedAt: new Date().toISOString(),
    value,
  };

  await AsyncStorage.setItem(key, JSON.stringify(envelope));
}

export function readCachedTodayPlan() {
  return readCache<MobileTodayPlanResponse>(cacheKeys.todayPlan);
}

export function writeCachedTodayPlan(value: MobileTodayPlanResponse) {
  return writeCache(cacheKeys.todayPlan, value);
}

export function readCachedCalendar() {
  return readCache<MobileCalendarResponse>(cacheKeys.calendar);
}

export function writeCachedCalendar(value: MobileCalendarResponse) {
  return writeCache(cacheKeys.calendar, value);
}
