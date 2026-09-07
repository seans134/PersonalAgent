import { describe, expect, it } from "vitest";
import { computeHabitMetrics, computeNudges, type HabitMetrics, type Nudge } from "@personal-agent/core";
import { buildDeterministicDigest, generateHabitDigest, validateHabitDigest } from "./habit-insights";

const metrics: HabitMetrics = computeHabitMetrics({
  meals: [
    { logged_at: "2026-09-07T12:00:00Z", calories: 600, protein_grams: 60, carbs_grams: 40, fat_grams: 20, fiber_grams: 5 },
    { logged_at: "2026-09-06T12:00:00Z", calories: 650, protein_grams: 62, carbs_grams: 42, fat_grams: 21, fiber_grams: 6 },
    { logged_at: "2026-09-05T12:00:00Z", calories: 640, protein_grams: 61, carbs_grams: 41, fat_grams: 22, fiber_grams: 6 },
  ],
  workouts: [
    { logged_at: "2026-09-07T07:00:00Z", workout_type: "strength", duration_minutes: 45, intensity: "moderate" },
  ],
  targets: { calorieTarget: 640, proteinTarget: 55 },
  range: { endDate: "2026-09-07", days: 7, timezone: "UTC" },
});
const nudges: Nudge[] = computeNudges(metrics);

const validPayload = {
  headline: "Strong week of consistent logging.",
  endorsements: ["You logged meals three days running.", "  "],
  improvements: [{ area: "Movement", suggestion: "Add one more session this week." }, { suggestion: "" }],
  summary: "Great consistency — a little more movement rounds it out.",
};

describe("validateHabitDigest", () => {
  it("clamps and drops empty entries", () => {
    const digest = validateHabitDigest(validPayload);
    expect(digest.headline).toBe("Strong week of consistent logging.");
    expect(digest.endorsements).toEqual(["You logged meals three days running."]);
    expect(digest.improvements).toEqual([{ area: "Movement", suggestion: "Add one more session this week." }]);
  });

  it("throws when headline or summary is missing", () => {
    expect(() => validateHabitDigest({ ...validPayload, headline: "" })).toThrow();
  });

  it("throws on unsafe language", () => {
    expect(() =>
      validateHabitDigest({ ...validPayload, summary: "Just starve yourself to hit the target." }),
    ).toThrow(/unsafe/i);
  });
});

describe("generateHabitDigest", () => {
  it("uses injected output and reports the gemini source", async () => {
    const result = await generateHabitDigest({
      period: "weekly",
      timezone: "UTC",
      metrics,
      nudges,
      generateOutput: async () => validPayload,
    });
    expect(result.source).toBe("gemini");
    expect(result.digest.headline).toBe("Strong week of consistent logging.");
  });

  it("falls back to deterministic when the generator throws", async () => {
    const result = await generateHabitDigest({
      period: "weekly",
      timezone: "UTC",
      metrics,
      nudges,
      generateOutput: async () => {
        throw new Error("boom");
      },
    });
    expect(result.source).toBe("deterministic");
    expect(result.digest.summary.length).toBeGreaterThan(0);
  });

  it("falls back to deterministic on unsafe output", async () => {
    const result = await generateHabitDigest({
      period: "weekly",
      timezone: "UTC",
      metrics,
      nudges,
      generateOutput: async () => ({ ...validPayload, summary: "You should purge after eating." }),
    });
    expect(result.source).toBe("deterministic");
  });

  it("falls back to deterministic when no generator is available", async () => {
    const result = await generateHabitDigest({ period: "daily", timezone: "UTC", metrics, nudges });
    expect(result.source).toBe("deterministic");
  });
});

describe("buildDeterministicDigest", () => {
  it("maps nudges into endorsements and improvements", () => {
    const digest = buildDeterministicDigest(metrics, nudges);
    expect(digest.headline.length).toBeGreaterThan(0);
    expect(digest.summary).toContain("workout");
    expect(Array.isArray(digest.endorsements)).toBe(true);
    expect(Array.isArray(digest.improvements)).toBe(true);
  });
});
