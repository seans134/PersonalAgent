import { describe, expect, it } from "vitest";
import { parseAuthDeepLink } from "./auth-deep-link";

describe("parseAuthDeepLink", () => {
  it("parses an email confirmation PKCE callback", () => {
    expect(parseAuthDeepLink("atlas://auth/callback?code=confirmation-code&type=signup")).toMatchObject({
      handled: true,
      recovery: false,
      code: "confirmation-code",
    });
  });

  it("parses a password recovery PKCE callback", () => {
    expect(parseAuthDeepLink("atlas://auth/callback?code=recovery-code&type=recovery")).toMatchObject({
      handled: true,
      recovery: true,
      code: "recovery-code",
    });
  });

  it("parses a password recovery token callback", () => {
    expect(
      parseAuthDeepLink("atlas://auth/callback#access_token=access&refresh_token=refresh&type=recovery"),
    ).toMatchObject({
      handled: true,
      recovery: true,
      accessToken: "access",
      refreshToken: "refresh",
    });
  });

  it("returns provider errors without treating them as a session", () => {
    expect(parseAuthDeepLink("atlas://auth/callback?error_description=Link%20expired")).toMatchObject({
      handled: true,
      recovery: false,
      error: "Link expired",
    });
  });

  it("ignores malformed and unrelated links", () => {
    expect(parseAuthDeepLink("not a valid URL").handled).toBe(false);
    expect(parseAuthDeepLink("atlas://auth/callback").handled).toBe(false);
  });
});
