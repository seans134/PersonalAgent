import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeNextPath("/join/AbC_def-1234567890xyzQ?a=b")).toBe("/join/AbC_def-1234567890xyzQ?a=b");
    expect(safeNextPath("/courses#top")).toBe("/courses#top");
  });

  it("rejects paths a browser would send off-site", () => {
    for (const value of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/ /evil.com",
      decodeURIComponent("/%09/evil.com"),
      "/\\evil.com",
      "\\\\evil.com",
      "//evil.com",
      "///evil.com",
      "javascript:alert(1)",
      "https://evil.com",
      "evil.com",
      "",
    ]) {
      expect(safeNextPath(value), JSON.stringify(value)).toBeNull();
    }
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });
});
