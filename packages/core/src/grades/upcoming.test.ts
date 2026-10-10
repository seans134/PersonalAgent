import { describe, expect, it } from "vitest";
import { countDueWithin } from "./upcoming";

const now = new Date("2026-10-10T12:00:00Z");

describe("countDueWithin", () => {
  it("counts ungraded items due in the next 7 days", () => {
    const items = [
      { dueAt: "2026-10-10T18:00:00Z", scoreEarned: null },
      { dueAt: "2026-10-16T23:59:00Z", scoreEarned: null },
      { dueAt: "2026-10-17T12:00:00Z", scoreEarned: null },
    ];
    expect(countDueWithin(items, now)).toBe(3);
  });

  it("skips past, graded, far-off and unparseable items", () => {
    const items = [
      { dueAt: "2026-10-09T12:00:00Z", scoreEarned: null },
      { dueAt: "2026-10-12T12:00:00Z", scoreEarned: 92 },
      { dueAt: "2026-10-17T12:00:01Z", scoreEarned: null },
      { dueAt: "not a date", scoreEarned: null },
    ];
    expect(countDueWithin(items, now)).toBe(0);
  });

  it("honours a custom window", () => {
    const items = [{ dueAt: "2026-10-12T12:00:00Z", scoreEarned: null }];
    expect(countDueWithin(items, now, 1)).toBe(0);
    expect(countDueWithin(items, now, 2)).toBe(1);
  });
});
