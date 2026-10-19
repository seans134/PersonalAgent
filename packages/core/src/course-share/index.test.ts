import { describe, expect, it } from "vitest";
import {
  buildJoinUrl,
  courseSharePreview,
  courseTemplateFromSnapshot,
  isShareToken,
  parseJoinLink,
  redactShareLinksInEvent,
  redactShareTokens,
  shareCountsLabel,
  shareTokenFromBytes,
} from "./index";

const snapshot = {
  shareId: "share-1",
  ownCourseId: null,
  course: {
    name: " Organic Chemistry ", code: "CHEM 201", term: "Fall 2026",
    // Fields a future snapshot might carry by mistake; none may reach the template.
    id: "course-1", user_id: "owner-1", target_grade: 92, color: "#f00", owner_email: "owner@school.edu",
  },
  categories: [
    { name: "Homework", weight: 40, id: "cat-1", user_id: "owner-1" },
    { name: "", weight: 10 },
    { name: "Exams", weight: "60" },
  ],
  items: [
    {
      kind: "exam", title: "Midterm", dueAt: "2026-10-20T14:00:00+00:00", endAt: "2026-10-20T16:00:00+00:00",
      scoreMax: 100, estimatedEffortHours: 6, categoryIndex: 2,
      score_earned: 71, scoreEarned: 71, notes: "panicked", location: "Room 4", user_id: "owner-1", focus_mode: "deferred",
    },
    { kind: "assignment", title: "PS 1", dueAt: "2026-10-01T16:00:00Z", endAt: null, scoreMax: 10, categoryIndex: 0 },
    { kind: "quiz", title: "Quiz on dropped category", dueAt: "2026-10-05T16:00:00Z", scoreMax: 0, categoryIndex: 1 },
    { kind: "lab", title: "Unknown kind", dueAt: "2026-10-06T16:00:00Z" },
    { kind: "quiz", title: "No date", dueAt: null },
  ],
};

describe("courseTemplateFromSnapshot", () => {
  it("copies only template fields", () => {
    const template = courseTemplateFromSnapshot(snapshot)!;
    expect(template.course).toEqual({ name: "Organic Chemistry", code: "CHEM 201", term: "Fall 2026" });
    expect(template.categories).toEqual([
      { name: "Homework", weight: 40 },
      { name: "Exams", weight: 60 },
    ]);
    expect(template.items).toEqual([
      {
        kind: "assignment", title: "PS 1", dueAt: "2026-10-01T16:00:00.000Z", endAt: null, scoreMax: 10,
        estimatedEffortHours: null, categoryIndex: 0,
      },
      {
        kind: "quiz", title: "Quiz on dropped category", dueAt: "2026-10-05T16:00:00.000Z", endAt: null, scoreMax: 100,
        estimatedEffortHours: null, categoryIndex: null,
      },
      {
        kind: "exam", title: "Midterm", dueAt: "2026-10-20T14:00:00.000Z", endAt: "2026-10-20T16:00:00.000Z",
        scoreMax: 100, estimatedEffortHours: 6, categoryIndex: 1,
      },
    ]);
  });

  it("never leaks scores, notes, ids or owner details", () => {
    const serialized = JSON.stringify(courseTemplateFromSnapshot(snapshot));
    for (const leaked of ["owner", "user_id", "course-1", "cat-1", "share-1", "92", "71", "panicked", "Room 4", "deferred", "#f00"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("rejects snapshots without a course name", () => {
    expect(courseTemplateFromSnapshot(null)).toBeNull();
    expect(courseTemplateFromSnapshot({ course: { name: " " } })).toBeNull();
    expect(courseTemplateFromSnapshot({ course: { name: "Bio" } })).toEqual({
      course: { name: "Bio", code: null, term: null }, categories: [], items: [],
    });
  });
});

describe("courseSharePreview", () => {
  it("counts items by kind and lists the next few due", () => {
    const template = courseTemplateFromSnapshot(snapshot)!;
    const preview = courseSharePreview(template, new Date("2026-10-02T00:00:00Z"), 1);
    expect(preview.counts).toEqual({ exam: 1, quiz: 1, assignment: 1 });
    expect(preview.categoryCount).toBe(2);
    expect(preview.upcoming).toEqual([{ kind: "quiz", title: "Quiz on dropped category", dueAt: "2026-10-05T16:00:00.000Z" }]);
  });
});

describe("shareCountsLabel", () => {
  it("pluralizes and skips empty kinds", () => {
    expect(shareCountsLabel({ exam: 2, quiz: 1, assignment: 0 })).toBe("2 exams · 1 quiz");
    expect(shareCountsLabel({ exam: 0, quiz: 0, assignment: 8 })).toBe("8 assignments");
    expect(shareCountsLabel({ exam: 0, quiz: 0, assignment: 0 })).toBe("No dated items yet");
  });
});

describe("share tokens", () => {
  it("encodes random bytes as unpadded base64url", () => {
    expect(shareTokenFromBytes(new Uint8Array(16).fill(255))).toBe("_____________________w");
    const token = shareTokenFromBytes(Uint8Array.from({ length: 24 }, (_, i) => i * 10));
    expect(token).toHaveLength(32);
    expect(isShareToken(token)).toBe(true);
  });

  it("refuses fewer than 128 bits", () => {
    expect(() => shareTokenFromBytes(new Uint8Array(15))).toThrow();
  });

  it("validates token format", () => {
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("a".repeat(22))).toBe(true);
    expect(isShareToken("a".repeat(21) + "/")).toBe(false);
    expect(isShareToken(42)).toBe(false);
  });
});

describe("join links", () => {
  const token = "AbC_def-1234567890xyzQ";

  it("builds the web link", () => {
    expect(buildJoinUrl("https://atlas.example/", token)).toBe(`https://atlas.example/join/${token}`);
  });

  it("parses app and web join links", () => {
    expect(parseJoinLink(`atlas://join/${token}`)).toBe(token);
    expect(parseJoinLink(`atlas:///join/${token}`)).toBe(token);
    expect(parseJoinLink(`https://atlas.example/join/${token}/`)).toBe(token);
    expect(parseJoinLink(`https://atlas.example/join/${token}?utm=x`)).toBe(token);
  });

  it("ignores other links", () => {
    expect(parseJoinLink("atlas://auth/callback?code=abc")).toBeNull();
    expect(parseJoinLink("atlas://join/short")).toBeNull();
    expect(parseJoinLink(`https://atlas.example/courses/join/${token}`)).toBeNull();
    expect(parseJoinLink("not a url")).toBeNull();
  });
});

describe("redactShareTokens", () => {
  it("hides tokens in paths and URLs", () => {
    expect(redactShareTokens("/api/mobile/courses/join/AbC_def-1234567890xyzQ")).toBe("/api/mobile/courses/join/:token");
    expect(redactShareTokens("https://atlas.example/join/AbC_def-1234567890xyzQ?x=1#y")).toBe("https://atlas.example/join/:token?x=1#y");
    expect(redactShareTokens("atlas://join/AbC_def-1234567890xyzQ")).toBe("atlas://join/:token");
    expect(redactShareTokens("/courses/abc")).toBe("/courses/abc");
  });
});

describe("redactShareLinksInEvent", () => {
  it("strips share tokens from event and person properties", () => {
    const event = redactShareLinksInEvent({
      event: "$pageview",
      properties: { $current_url: "https://atlas.example/join/AbC_def-1234567890xyzQ", token: "phc_project", count: 2 },
      $set_once: { $initial_current_url: "https://atlas.example/join/AbC_def-1234567890xyzQ?x=1" },
    });
    expect(event.properties).toEqual({ $current_url: "https://atlas.example/join/:token", token: "phc_project", count: 2 });
    expect(event.$set_once).toEqual({ $initial_current_url: "https://atlas.example/join/:token?x=1" });
    expect(JSON.stringify(event)).not.toContain("AbC_def");
  });
});
