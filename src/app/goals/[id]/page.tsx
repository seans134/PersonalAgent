import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

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
    .select("id, title, description, priority, task_type, minimum_daily_minutes, end_date, completed_at, created_at")
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
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{goal.title}</h1>
          <p className="mt-2 text-ink-muted">Goal details</p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/goals">
          Back to goals
        </Link>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {goal.description ? <p className="mb-6 text-ink-muted">{goal.description}</p> : null}
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-surface2 p-4">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Status</dt>
            <dd className="mt-2 text-sm font-medium text-ink">
              {goal.completed_at ? "Complete" : "Active"}
            </dd>
          </div>
          <div className="rounded-lg bg-surface2 p-4">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">End date</dt>
            <dd className="mt-2 text-sm font-medium text-ink">
              {goal.end_date ? formatDateOnly(goal.end_date) : "No end date"}
            </dd>
          </div>
          <div className="rounded-lg bg-surface2 p-4">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Task type</dt>
            <dd className="mt-2 text-sm font-medium capitalize text-ink">
              {goal.task_type ?? "general"}
            </dd>
          </div>
          <div className="rounded-lg bg-surface2 p-4">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Minimum daily time</dt>
            <dd className="mt-2 text-sm font-medium text-ink">
              {goal.minimum_daily_minutes ?? 0} minutes
            </dd>
          </div>
          <div className="rounded-lg bg-surface2 p-4">
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Created</dt>
            <dd className="mt-2 text-sm font-medium text-ink">
              {new Date(goal.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
