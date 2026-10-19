import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signIn, signUp } from "./actions";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect((await isOnboardingComplete(supabase, user.id)) ? "/" : "/onboarding/courses");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
      <section className="grid w-full gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Atlas</h1>
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-teal">Study Planner</p>
          </div>
          <p className="text-ink-muted">
            Sign in or create an account to add your courses and class times and get a daily study plan.
          </p>
          {params.ok ? (
            <p className="rounded-lg border border-success bg-surface2 px-3 py-2 text-sm text-success">{params.ok}</p>
          ) : null}
          {params.error ? (
            <p className="rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{params.error}</p>
          ) : null}
          <Link className="text-sm text-ink-muted underline" href="/">
            Back to home
          </Link>
        </div>
        <div className="space-y-4">
          <AuthForm title="Sign in" actionLabel="Sign in" action={signIn} />
          <AuthForm title="Create account" actionLabel="Sign up" action={signUp} requirePasswordConfirmation />
        </div>
      </section>
    </main>
  );
}
