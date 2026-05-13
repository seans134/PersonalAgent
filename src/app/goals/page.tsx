import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, priority")
    .eq("user_id", user.id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Goals</h1>
          <p className="mt-2 text-zinc-700">Review the goals Atlas uses to shape your daily plan.</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {!goals?.length ? (
          <div>
            <p className="text-zinc-700">No goals saved yet.</p>
            <Link className="mt-4 inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href="/onboarding">
              Add goals
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => (
              <li className="rounded-lg border border-zinc-200 p-4" key={goal.id}>
                <Link className="block" href={`/goals/${goal.id}`}>
                  <p className="font-medium text-zinc-900">{goal.title}</p>
                  <p className="mt-1 text-sm text-zinc-600">Priority {goal.priority}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
