import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signUp } from "./actions";

const { createClientMock, redirectMock, isOnboardingCompleteMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  // redirect() never returns in Next; throwing keeps the action from running on.
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  isOnboardingCompleteMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/onboarding/status", () => ({
  isOnboardingComplete: isOnboardingCompleteMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

const signUpForm = () => form({ email: "a@b.co", password: "password1", confirmPassword: "password1" });

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://atlas.example");
  });

  it("signUp sends the confirmation link to onboarding step 1", async () => {
    const signUpMock = vi.fn(async () => ({ data: { session: { access_token: "t" } }, error: null }));
    createClientMock.mockResolvedValue({ auth: { signUp: signUpMock } });

    await expect(signUp(undefined, signUpForm())).rejects.toThrow(/^REDIRECT:\/onboarding\/courses$/);
    expect(signUpMock).toHaveBeenCalledWith({
      email: "a@b.co",
      password: "password1",
      options: { emailRedirectTo: "https://atlas.example/auth/callback?next=/onboarding/courses" },
    });
  });

  it("signUp asks the student to confirm their email when no session is returned", async () => {
    createClientMock.mockResolvedValue({
      auth: { signUp: vi.fn(async () => ({ data: { session: null }, error: null })) },
    });

    await expect(signUp(undefined, signUpForm())).rejects.toThrow(/REDIRECT:\/auth\?ok=Check%20your%20email/);
  });

  it("signIn sends students who haven't finished onboarding to step 1", async () => {
    createClientMock.mockResolvedValue({
      auth: { signInWithPassword: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
    });
    isOnboardingCompleteMock.mockResolvedValue(false);

    await expect(signIn(undefined, form({ email: "a@b.co", password: "password1" }))).rejects.toThrow(
      "REDIRECT:/onboarding/courses",
    );
  });

  it("signIn leaves students who finished onboarding on Today", async () => {
    createClientMock.mockResolvedValue({
      auth: { signInWithPassword: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })) },
    });
    isOnboardingCompleteMock.mockResolvedValue(true);

    await expect(signIn(undefined, form({ email: "a@b.co", password: "password1" }))).rejects.toThrow(/^REDIRECT:\/$/);
  });
});
