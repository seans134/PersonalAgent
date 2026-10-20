import { describe, expect, it } from "vitest";
import { defaultAtlasProfile, validateProfile } from ".";
describe("profile validation", () => {
  it("trims display names and permits clearing the unavailable window", () => { expect(validateProfile({ ...defaultAtlasProfile, display_name: "  Sam  " })).toMatchObject({ display_name: "Sam", no_meeting_start: null }); });
  it("rejects invalid preference ranges and timezone", () => {
    expect(() => validateProfile({ ...defaultAtlasProfile, timezone: "invalid" })).toThrow(/timezone/);
    expect(() => validateProfile({ ...defaultAtlasProfile, focus_block_minutes: 5 })).toThrow(/15/);
    expect(() => validateProfile({ ...defaultAtlasProfile, no_meeting_start: "12:00" })).toThrow(/unavailable/);
    expect(() => validateProfile({ ...defaultAtlasProfile, work_end_time: "08:00" })).toThrow(/Work end/);
    expect(() => validateProfile({ ...defaultAtlasProfile, gpa_scale: "us_5_0" })).toThrow(/GPA scale/);
  });
  it("keeps the GPA scale when given and leaves it out when an older client omits it", () => {
    expect(validateProfile({ ...defaultAtlasProfile, gpa_scale: "us_4_3" }).gpa_scale).toBe("us_4_3");
    const legacy: Record<string, unknown> = { ...defaultAtlasProfile };
    delete legacy.gpa_scale;
    expect("gpa_scale" in validateProfile(legacy)).toBe(false);
  });
});
