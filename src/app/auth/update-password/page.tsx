import Link from "next/link";
import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reaching this page requires the recovery session established by the callback
  // route. Without it, send them to request a fresh reset link.
  if (!user) {
    redirect("/auth?error=Reset%20link%20expired.%20Request%20a%20new%20one.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Reset password</h1>
        <p className="mt-2 text-ink-muted">
          Choose a new password for <span className="font-medium text-ink">{user.email}</span>.
        </p>
      </div>

      <UpdatePasswordForm />

      <div className="mt-6">
        <Link className="text-sm text-ink-muted underline" href="/">
          Cancel
        </Link>
      </div>
    </main>
  );
}
