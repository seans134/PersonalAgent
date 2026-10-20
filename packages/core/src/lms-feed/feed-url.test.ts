import { describe, expect, it } from "vitest";
import {
  detectLmsProvider,
  isLmsFeedStale,
  lmsFeedErrorMessage,
  LMS_FEED_ERROR_CODES,
  looksLikeLmsFeedUrl,
  maskLmsFeedUrl,
  normalizeLmsFeedUrl,
  redactUrls,
} from "./feed-url";
import { lmsFeedSyncedProperties, lmsLastSyncedLabel, lmsSyncSummary, parseLmsPendingItemAction } from "./contract";

const CANVAS = "https://canvas.example.edu/feeds/calendars/user_AbCdEf0123456789secret.ics";

describe("normalizeLmsFeedUrl", () => {
  it("accepts https and rewrites webcal to https", () => {
    expect(normalizeLmsFeedUrl(` ${CANVAS} `)).toEqual({ ok: true, url: CANVAS, host: "canvas.example.edu" });
    expect(normalizeLmsFeedUrl("webcal://canvas.example.edu/feeds/x.ics")).toMatchObject({ ok: true, url: "https://canvas.example.edu/feeds/x.ics" });
    expect(normalizeLmsFeedUrl("WEBCALS://Moodle.Example.edu/cal.php?token=1#frag")).toMatchObject({
      ok: true,
      url: "https://moodle.example.edu/cal.php?token=1",
      host: "moodle.example.edu",
    });
    expect(normalizeLmsFeedUrl("https://canvas.example.edu:443/feed.ics")).toMatchObject({ ok: true });
  });

  it("rejects other schemes, credentials, ports, single-label hosts and junk", () => {
    for (const value of [
      "http://canvas.example.edu/feed.ics",
      "ftp://canvas.example.edu/feed.ics",
      "file:///etc/passwd",
      "https://user:pass@canvas.example.edu/feed.ics",
      "https://canvas.example.edu:8443/feed.ics",
      "https://localhost/feed.ics",
      "https://[::1]/feed.ics",
      "https://canvas.example.edu/a b",
      "not a url",
      "",
      42,
      `https://canvas.example.edu/${"a".repeat(2100)}`,
    ]) {
      expect(normalizeLmsFeedUrl(value)).toEqual({ ok: false, code: "invalid_url" });
    }
  });
});

describe("masking and redaction", () => {
  it("shows only the host", () => {
    expect(maskLmsFeedUrl(CANVAS)).toBe("https://canvas.example.edu/••••••");
    expect(maskLmsFeedUrl(CANVAS)).not.toContain("secret");
    expect(maskLmsFeedUrl("garbage")).toBe("••••••");
  });

  it("redacts links from messages", () => {
    expect(redactUrls(`connect failed for ${CANVAS} (ECONNRESET)`)).toBe("connect failed for [link] (ECONNRESET)");
    expect(redactUrls("webcal://x.y/z?token=1")).toBe("[link]");
  });

  it("has student-facing copy for every error code, without links", () => {
    for (const code of LMS_FEED_ERROR_CODES) expect(lmsFeedErrorMessage(code)).not.toMatch(/https?:\/\/\w/);
    expect(LMS_FEED_ERROR_CODES).toContain("internal");
  });
});

describe("looksLikeLmsFeedUrl", () => {
  it("does a quick shape check", () => {
    expect(looksLikeLmsFeedUrl(CANVAS)).toBe(true);
    expect(looksLikeLmsFeedUrl("webcal://moodle.example.edu/calendar/export_execute.php?x=1")).toBe(true);
    expect(looksLikeLmsFeedUrl("webcals://moodle.example.edu/calendar/export_execute.php?x=1")).toBe(true);
    expect(looksLikeLmsFeedUrl("http://canvas.example.edu/feed")).toBe(false);
    expect(looksLikeLmsFeedUrl("canvas.example.edu/feed")).toBe(false);
    expect(looksLikeLmsFeedUrl("https://localhost/feed")).toBe(false);
  });
});

describe("detectLmsProvider", () => {
  it("guesses the LMS from the host", () => {
    expect(detectLmsProvider("school.instructure.com")).toBe("canvas");
    expect(detectLmsProvider("canvas.example.edu")).toBe("canvas");
    expect(detectLmsProvider("school.brightspace.com")).toBe("brightspace");
    expect(detectLmsProvider("d2l.example.edu")).toBe("brightspace");
    expect(detectLmsProvider("moodle.example.edu")).toBe("moodle");
    expect(detectLmsProvider("example.blackboard.com")).toBe("blackboard");
    expect(detectLmsProvider("lms.example.edu")).toBe("other");
    expect(detectLmsProvider(null)).toBe("other");
  });
});

describe("isLmsFeedStale", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  it("is stale when never synced or synced 12+ hours ago", () => {
    expect(isLmsFeedStale(null, now)).toBe(true);
    expect(isLmsFeedStale("2026-10-20T00:00:00.000Z", now)).toBe(true);
    expect(isLmsFeedStale("2026-10-20T00:00:01.000Z", now)).toBe(false);
    expect(isLmsFeedStale("nonsense", now)).toBe(true);
  });
});

describe("contract helpers", () => {
  it("validates pending-item actions", () => {
    expect(parseLmsPendingItemAction({ action: "skip" })).toEqual({ ok: true, value: { action: "skip" } });
    const courseId = "11111111-1111-4111-8111-111111111111";
    expect(parseLmsPendingItemAction({ action: "assign", courseId, kind: "exam" })).toEqual({
      ok: true,
      value: { action: "assign", courseId, kind: "exam" },
    });
    expect(parseLmsPendingItemAction({ action: "assign", courseId: "x" }).ok).toBe(false);
    expect(parseLmsPendingItemAction({ action: "assign", courseId, kind: "lecture" }).ok).toBe(false);
    expect(parseLmsPendingItemAction({ action: "delete" }).ok).toBe(false);
    expect(parseLmsPendingItemAction(null).ok).toBe(false);
  });

  it("builds analytics properties from counts only", () => {
    const props = lmsFeedSyncedProperties({ events: 40, deadlines: 12, added: 10, updated: 1, needsCourse: 2 }, "auto");
    expect(props).toEqual({
      trigger: "auto",
      event_count: 40,
      deadline_count: 12,
      added_count: 10,
      updated_count: 1,
      needs_course_count: 2,
    });
    for (const value of Object.values(props)) expect(["string", "number"]).toContain(typeof value);
  });

  it("formats the last sync and a sync summary", () => {
    const now = new Date("2026-10-20T12:00:00.000Z");
    expect(lmsLastSyncedLabel(null, now)).toBe("Not synced yet");
    expect(lmsLastSyncedLabel("2026-10-20T11:59:40.000Z", now)).toBe("Synced just now");
    expect(lmsLastSyncedLabel("2026-10-20T11:15:00.000Z", now)).toBe("Synced 45 min ago");
    expect(lmsLastSyncedLabel("2026-10-20T07:00:00.000Z", now)).toBe("Synced 5 h ago");
    expect(lmsLastSyncedLabel("2026-10-19T07:00:00.000Z", now)).toBe("Synced 1 day ago");
    expect(lmsSyncSummary({ events: 9, deadlines: 5, added: 3, updated: 1, needsCourse: 2 })).toBe(
      "3 new deadlines, 1 deadline changed, 2 need a course",
    );
    expect(lmsSyncSummary({ events: 9, deadlines: 5, added: 1, updated: 0, needsCourse: 0 })).toBe("1 new deadline");
  });
});
