import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signIn, signUp } from "./actions";
import { createClient } from "@/lib/supabase/server";

export default async function AuthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
      <section className="grid w-full gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Atlas</h1>
          <p className="text-zinc-700">
            Sign in or create an account to start your onboarding for goals, constraints, and preferences.
          </p>
          <Link className="text-sm text-zinc-600 underline" href="/">
            Back to home
          </Link>
        </div>
        <div className="space-y-4">
          <AuthForm title="Sign in" actionLabel="Sign in" action={signIn} />
          <AuthForm title="Create account" actionLabel="Sign up" action={signUp} />
        </div>
      </section>
    </main>
  );
}
