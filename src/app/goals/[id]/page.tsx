import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("id, title, priority, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!goal) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{goal.title}</h1>
          <p className="mt-2 text-zinc-700">Goal details</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/goals">
          Back to goals
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Priority</dt>
            <dd className="mt-2 text-2xl font-semibold text-zinc-900">{goal.priority}</dd>
          </div>
          <div className="rounded-lg bg-zinc-50 p-4">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Created</dt>
            <dd className="mt-2 text-sm font-medium text-zinc-900">
              {new Date(goal.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
