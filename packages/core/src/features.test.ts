import { describe, expect, it } from "vitest";
import { features, isFeatureEnabled } from "./features";

describe("features", () => {
  it("hides wellness tracking for the student release", () => {
    expect(features.wellnessTracking).toBe(false);
    expect(isFeatureEnabled("wellnessTracking")).toBe(false);
  });
});
