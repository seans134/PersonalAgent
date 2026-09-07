import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InsightsPanel } from "./insights-panel";

export default async function TrackingInsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Tracking</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Insights</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            A look at your recent meals and workouts — what&apos;s going well, and where a small change would help.
          </p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/">
          Back home
        </Link>
      </div>

      <InsightsPanel />
    </main>
  );
}
