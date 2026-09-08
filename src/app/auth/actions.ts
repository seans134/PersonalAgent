"use server";

import { redirect } from "next/navigation";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

type AuthActionState = { error?: string } | undefined;

export async function signIn(_: AuthActionState, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Returning users who have already been through onboarding land on Today;
  // only users who haven't completed it are dropped into the guided flow.
  if (data.user && (await isOnboardingComplete(supabase, data.user.id))) {
    redirect("/");
  }

  redirect("/onboarding/schedule");
}

export async function updatePassword(_: AuthActionState, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords must match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The recovery session is missing or expired — send them back to request a new link.
    redirect("/auth?error=Reset%20link%20expired.%20Request%20a%20new%20one.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  redirect("/settings?ok=Password%20updated");
}

export async function signUp(_: AuthActionState, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

  if (!email || !password || !confirmPassword) {
    return { error: "Email, password, and password confirmation are required." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords must match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/onboarding/schedule");
}
