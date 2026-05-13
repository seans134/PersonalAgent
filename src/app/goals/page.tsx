import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createGoal } from "./actions";
import { GoalsList } from "./goals-list";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, priority, end_date, completed_at")
    .eq("user_id", user.id)
    .is("completed_at", null)
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

      <form action={createGoal} className="mb-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Add goal</h2>
          <p className="mt-1 text-sm text-zinc-600">Create a goal with a clear title and target end date.</p>
        </div>
        {params.error ? <p className="text-sm text-red-600">{params.error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="title">
              Goal title
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
              id="title"
              name="title"
              placeholder="Ex: Run a half marathon"
              required
              type="text"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="end_date">
              End date
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              id="end_date"
              name="end_date"
              type="date"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-zinc-700" htmlFor="description">
            Description
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
            id="description"
            name="description"
            placeholder="Optional notes about why this goal matters or what success looks like"
          />
        </div>
        <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
          Add goal
        </button>
      </form>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <GoalsList goals={goals ?? []} />
      </section>
    </main>
  );
}
