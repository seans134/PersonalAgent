import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "./actions";

function toTimeInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

export default async function OnboardingPage({
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

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("work_start_time, work_end_time, no_meeting_start, no_meeting_end, focus_block_minutes, workout_preference")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: goals } = await supabase
    .from("goals")
    .select("title")
    .eq("user_id", user.id)
    .order("priority", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Onboarding</h1>
          <p className="mt-2 text-zinc-700">Set your goals, schedule constraints, and preferences for Atlas.</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      <form action={saveOnboarding} className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {params.error ? <p className="text-sm text-red-600">{params.error}</p> : null}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Goals</h2>
          <p className="text-sm text-zinc-600">Add one goal per line. Top lines are treated as higher priority.</p>
          <textarea
            className="min-h-32 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
            defaultValue={goals?.map((goal) => goal.title).join("\n") ?? ""}
            name="goals"
            placeholder="Exercise 3x per week&#10;Deep work for 2 hours daily&#10;Read 20 pages nightly"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="work_start_time">
              Work start
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={toTimeInputValue(profile?.work_start_time) || "09:00"}
              id="work_start_time"
              name="work_start_time"
              required
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="work_end_time">
              Work end
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={toTimeInputValue(profile?.work_end_time) || "17:00"}
              id="work_end_time"
              name="work_end_time"
              required
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="no_meeting_start">
              No meetings start (optional)
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={toTimeInputValue(profile?.no_meeting_start)}
              id="no_meeting_start"
              name="no_meeting_start"
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="no_meeting_end">
              No meetings end (optional)
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={toTimeInputValue(profile?.no_meeting_end)}
              id="no_meeting_end"
              name="no_meeting_end"
              type="time"
            />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="focus_block_minutes">
              Preferred focus block (minutes)
            </label>
            <input
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={profile?.focus_block_minutes ?? 60}
              id="focus_block_minutes"
              max={240}
              min={15}
              name="focus_block_minutes"
              required
              type="number"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="workout_preference">
              Workout preference
            </label>
            <select
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
              defaultValue={profile?.workout_preference ?? "none"}
              id="workout_preference"
              name="workout_preference"
            >
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="intense">Intense</option>
            </select>
          </div>
        </section>

        <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
          Save onboarding
        </button>
      </form>
    </main>
  );
}
