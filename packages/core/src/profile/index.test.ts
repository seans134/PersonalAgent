import { describe, expect, it } from "vitest";
import { defaultAtlasProfile, validateProfile } from ".";
describe("profile validation", () => {
  it("trims display names and permits clearing the unavailable window", () => { expect(validateProfile({ ...defaultAtlasProfile, display_name: "  Sam  " })).toMatchObject({ display_name: "Sam", no_meeting_start: null }); });
  it("rejects invalid preference ranges and timezone", () => {
    expect(() => validateProfile({ ...defaultAtlasProfile, timezone: "invalid" })).toThrow(/timezone/);
    expect(() => validateProfile({ ...defaultAtlasProfile, focus_block_minutes: 5 })).toThrow(/15/);
    expect(() => validateProfile({ ...defaultAtlasProfile, no_meeting_start: "12:00" })).toThrow(/unavailable/);
    expect(() => validateProfile({ ...defaultAtlasProfile, work_end_time: "08:00" })).toThrow(/Work end/);
  });
});
