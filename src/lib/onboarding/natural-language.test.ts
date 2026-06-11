import { describe, expect, it } from "vitest";
import {
  parseNaturalLanguageOnboarding,
  validateNaturalLanguageOnboardingDraft,
} from "./natural-language";

describe("validateNaturalLanguageOnboardingDraft", () => {
  it("normalizes school and work schedule blocks", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {
          workStartTime: "09:00:00",
          workEndTime: "17:00",
          focusBlockMinutes: 62,
          workoutPreference: "moderate",
        },
        goals: [
          {
            title: "Learn Spanish",
            description: "Practice most weekdays",
            priority: 1,
            taskType: "focus",
            minimumDailyMinutes: 30,
            endDate: "2026-12-31",
          },
        ],
        scheduleBlocks: [
          {
            title: "Work",
            category: "work",
            daysOfWeek: [5, 1, 2, 3, 4, 1],
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
        warnings: ["Class time was not specific enough."],
      },
      "school_work",
    );

    expect(draft.profile.workStartTime).toBe("09:00");
    expect(draft.profile.focusBlockMinutes).toBe(60);
    expect(draft.goals).toEqual([]);
    expect(draft.scheduleBlocks[0].daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(draft.scheduleBlocks[0].timezone).toBe("America/Toronto");
    expect(draft.warnings[0]).toMatch(/class time/i);
  });

  it("normalizes goals in goals mode", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {
          workStartTime: "09:00",
          workEndTime: "17:00",
        },
        goals: [
          {
            title: "Learn Spanish",
            description: "Practice most weekdays",
            priority: 1,
            taskType: "focus",
            minimumDailyMinutes: 30,
            endDate: "2026-12-31",
          },
        ],
        scheduleBlocks: [
          {
            title: "Work",
            category: "work",
            daysOfWeek: [1],
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
      },
      "goals",
    );

    expect(draft.profile).toEqual({});
    expect(draft.scheduleBlocks).toEqual([]);
    expect(draft.goals[0]).toEqual({
      title: "Learn Spanish",
      description: "Practice most weekdays",
      priority: 1,
      taskType: "focus",
      minimumDailyMinutes: 30,
      endDate: "2026-12-31",
    });
  });

  it("normalizes goal planning hints and caps oversized daily minimums", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {},
        goals: [
          {
            title: "Get jacked",
            priority: 1,
            taskType: "exercise",
            minimumDailyMinutes: 9999,
          },
          {
            title: "Keep inbox clean",
            priority: 3,
            taskType: "admin",
            minimumDailyMinutes: 0,
          },
          {
            title: "Mystery goal",
            priority: 2,
            taskType: "chaos",
            minimumDailyMinutes: -45,
          },
        ],
        scheduleBlocks: [],
      },
      "goals",
    );

    expect(draft.goals).toEqual([
      {
        title: "Get jacked",
        description: null,
        priority: 1,
        taskType: "fitness",
        minimumDailyMinutes: 720,
        endDate: null,
      },
      {
        title: "Keep inbox clean",
        description: null,
        priority: 3,
        taskType: "admin",
        minimumDailyMinutes: 0,
        endDate: null,
      },
      {
        title: "Mystery goal",
        description: null,
        priority: 2,
        taskType: "general",
        minimumDailyMinutes: 0,
        endDate: null,
      },
    ]);
    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/capped to 720 minutes/i)]));
  });

  it("keeps weekly rhythm blocks separate from school and work", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {},
        goals: [],
        scheduleBlocks: [
          {
            title: "Study Spanish",
            category: "study",
            daysOfWeek: [1, 3],
            startTime: "19:00",
            endTime: "20:00",
          },
          {
            title: "Work",
            category: "work",
            daysOfWeek: [1],
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
      },
      "weekly_rhythm",
    );

    expect(draft.scheduleBlocks).toEqual([
      {
        title: "Study Spanish",
        category: "study",
        daysOfWeek: [1, 3],
        startTime: "19:00",
        endTime: "20:00",
        timezone: "America/Toronto",
      },
    ]);
    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/does not belong/i)]));
  });

  it("drops incomplete schedule blocks and invalid dates", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {},
        goals: [
          {
            title: "Run more",
            priority: 2,
            endDate: "soon",
          },
        ],
        scheduleBlocks: [
          {
            title: "Bad block",
            category: "work",
            daysOfWeek: [1],
            startTime: "18:00",
            endTime: "17:00",
          },
        ],
      },
      "goals",
    );

    expect(draft.goals[0].endDate).toBeNull();
    expect(draft.scheduleBlocks).toEqual([]);
    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/end date/i)]));
  });

  it("drops invalid schedule ranges for schedule modes", () => {
    const draft = validateNaturalLanguageOnboardingDraft(
      {
        profile: {},
        goals: [
          {
            title: "Run more",
            priority: 2,
            endDate: "soon",
          },
        ],
        scheduleBlocks: [
          {
            title: "Work",
            category: "work",
            daysOfWeek: [5, 1, 2, 3, 4, 1],
            startTime: "18:00",
            endTime: "17:00",
          },
        ],
      },
      "school_work",
    );

    expect(draft.goals).toEqual([]);
    expect(draft.scheduleBlocks).toEqual([]);
    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/end time/i)]));
  });
});

describe("parseNaturalLanguageOnboarding", () => {
  it("uses injected generation and validates the response", async () => {
    const draft = await parseNaturalLanguageOnboarding({
      text: "I work Monday to Friday from 9 to 5 and want to learn Spanish.",
      mode: "school_work",
      generateOutput: async ({ mode }) => ({
        profile: { workStartTime: "09:00", workEndTime: "17:00" },
        goals: mode === "goals" ? [{ title: "Learn Spanish", priority: 1 }] : [],
        scheduleBlocks: [
          {
            title: "Work",
            category: "work",
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
        warnings: [],
      }),
    });

    expect(draft.goals).toHaveLength(0);
    expect(draft.scheduleBlocks).toHaveLength(1);
  });
});
