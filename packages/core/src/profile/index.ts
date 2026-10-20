import { validTimezone } from "../schedule-import";
import { DEFAULT_GPA_SCALE, isGpaScaleId, type GpaScaleId } from "../grades/gpa";
export type AtlasProfile = {
  display_name: string;
  timezone: string;
  work_start_time: string;
  work_end_time: string;
  no_meeting_start: string | null;
  no_meeting_end: string | null;
  focus_block_minutes: number;
  gpa_scale: GpaScaleId;
};
export const defaultAtlasProfile: AtlasProfile = { display_name: "", timezone: "America/Toronto", work_start_time: "09:00", work_end_time: "17:00", no_meeting_start: null, no_meeting_end: null, focus_block_minutes: 60, gpa_scale: DEFAULT_GPA_SCALE };
export type AtlasProfileResponse = { profile: AtlasProfile; email: string; pendingEmail?: string };
// gpa_scale is optional on save so an app version without the GPA picker doesn't reset it.
export type AtlasProfileUpdate = Omit<AtlasProfile, "gpa_scale"> & { gpa_scale?: GpaScaleId };
export function validateProfile(value: unknown): AtlasProfileUpdate {
  const profile = value as AtlasProfile;
  if (!profile || typeof profile !== "object") throw new Error("Invalid profile.");
  if (typeof profile.display_name !== "string" || profile.display_name.trim().length > 100) throw new Error("Name must be 100 characters or fewer.");
  if (!validTimezone(profile.timezone)) throw new Error("Choose a valid timezone, such as America/Toronto.");
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(profile.work_start_time) || !clock.test(profile.work_end_time) || profile.work_end_time <= profile.work_start_time) throw new Error("Work end must follow work start.");
  if (!!profile.no_meeting_start !== !!profile.no_meeting_end || (profile.no_meeting_start && (!clock.test(profile.no_meeting_start) || !clock.test(profile.no_meeting_end!) || profile.no_meeting_end! <= profile.no_meeting_start))) throw new Error("Choose a valid unavailable-time range, or clear both times.");
  if (!Number.isInteger(profile.focus_block_minutes) || profile.focus_block_minutes < 15 || profile.focus_block_minutes > 240) throw new Error("Focus blocks must be 15–240 minutes.");
  if (profile.gpa_scale !== undefined && !isGpaScaleId(profile.gpa_scale)) throw new Error("Choose a GPA scale.");
  return { display_name: profile.display_name.trim(), timezone: profile.timezone, work_start_time: profile.work_start_time, work_end_time: profile.work_end_time, no_meeting_start: profile.no_meeting_start || null, no_meeting_end: profile.no_meeting_end || null, focus_block_minutes: profile.focus_block_minutes, ...(profile.gpa_scale !== undefined ? { gpa_scale: profile.gpa_scale } : {}) };
}
