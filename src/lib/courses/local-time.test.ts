import { describe, expect, it } from "vitest";
import { localDateOnly, localParts } from "./local-time";

describe("local-time", () => {
  it("converts a UTC instant into Toronto local parts", () => {
    // 2026-08-07T01:30:00Z is 2026-08-06 21:30 EDT
    const parts = localParts("2026-08-07T01:30:00Z", "America/Toronto");
    expect(parts.date).toBe("2026-08-06");
    expect(parts.time).toBe("21:30");
  });

  it("localDateOnly returns just the date", () => {
    expect(localDateOnly("2026-08-07T12:00:00Z", "America/Toronto")).toBe("2026-08-07");
  });
});
