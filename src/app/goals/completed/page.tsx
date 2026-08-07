import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { removeGoal } from "../actions";

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

export default async function CompletedGoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, end_date, completed_at")
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Completed goals</h1>
          <p className="mt-2 text-ink-muted">Review goals you have already finished.</p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/">
          Back home
        </Link>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {!goals?.length ? (
          <p className="text-ink-muted">No completed goals yet.</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => (
              <li className="rounded-lg border border-line p-4" key={goal.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{goal.title}</p>
                    {goal.description ? <p className="mt-1 text-sm text-ink-muted">{goal.description}</p> : null}
                    <p className="mt-1 text-sm text-ink-muted">
                      Completed {formatDateOnly(goal.completed_at.slice(0, 10))}
                    </p>
                    {goal.end_date ? (
                      <p className="mt-1 text-sm text-ink-muted">Target date was {formatDateOnly(goal.end_date)}</p>
                    ) : null}
                  </div>
                  <form action={removeGoal} className="shrink-0">
                    <input name="id" type="hidden" value={goal.id} />
                    <input name="return_to" type="hidden" value="/goals/completed" />
                    <button
                      className="rounded-lg border border-danger bg-danger px-4 py-2 text-sm font-medium text-on-teal"
                      type="submit"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
