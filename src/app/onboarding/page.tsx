import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { createClient } from "@/lib/supabase/server";
import { createScheduleBlock, removeScheduleBlock } from "./schedule-block-actions";
import { saveOnboarding } from "./actions";

type RhythmBlockRow = {
  id: string;
  title: string;
  category: "study" | "personal" | "unavailable";
  days_of_week: number[];
  start_time: string;
  end_time: string;
};

const DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

function toTimeInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatDays(days: number[]) {
  return DAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(", ");
}

function formatCategory(category: RhythmBlockRow["category"]) {
  if (category === "study") return "Study";
  if (category === "unavailable") return "Unavailable";
  return "Personal";
}

function RhythmBlockList({ blocks }: { blocks: RhythmBlockRow[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-zinc-600">No recurring habits added yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {blocks.map((block) => (
        <li key={block.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-4">
          <div>
            <p className="font-medium text-zinc-900">{block.title}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {formatCategory(block.category)} · {formatDays(block.days_of_week)} · {toTimeInputValue(block.start_time)}-
              {toTimeInputValue(block.end_time)}
            </p>
          </div>
          <form action={removeScheduleBlock}>
            <input name="id" type="hidden" value={block.id} />
            <input name="return_to" type="hidden" value="/onboarding" />
            <button className="text-sm text-zinc-600 underline" type="submit">
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
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

  const { data: rhythmBlocks } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .in("category", ["study", "personal", "unavailable"])
    .order("start_time", { ascending: true });

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Step 2 of 3</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Build your weekly rhythm</h1>
          <p className="mt-2 max-w-2xl text-zinc-700">
            Add recurring habits and protected time that should shape your week outside school and work.
          </p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/onboarding/schedule">
          Back
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-red-600">{params.error}</p> : null}
      <OnboardingProgress currentStep={2} />

      <section className="mb-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <form action={createScheduleBlock} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <input name="return_to" type="hidden" value="/onboarding" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Add recurring rhythm</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm text-zinc-700" htmlFor="rhythm-title">
                Name
              </label>
              <input
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
                id="rhythm-title"
                name="title"
                placeholder="Ex: Gym, study, family dinner"
                required
                type="text"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-zinc-700" htmlFor="rhythm-category">
                Type
              </label>
              <select
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                id="rhythm-category"
                name="category"
                required
              >
                <option value="study">Study</option>
                <option value="personal">Personal</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm text-zinc-700">Days</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {DAYS.map((day) => (
                <label
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-zinc-200 px-2 py-2 text-sm text-zinc-700 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white"
                  key={day.value}
                >
                  <input className="sr-only" name="days_of_week" type="checkbox" value={day.value} />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm text-zinc-700" htmlFor="rhythm-start-time">
                Start
              </label>
              <input
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                id="rhythm-start-time"
                name="start_time"
                required
                type="time"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-zinc-700" htmlFor="rhythm-end-time">
                End
              </label>
              <input
                className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                id="rhythm-end-time"
                name="end_time"
                required
                type="time"
              />
            </div>
          </div>

          <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
            Add rhythm block
          </button>
        </form>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Recurring rhythm</h2>
          <RhythmBlockList blocks={((rhythmBlocks ?? []) as RhythmBlockRow[]) ?? []} />
        </section>
      </section>

      <form action={saveOnboarding} className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Planning preferences</h2>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-zinc-700" htmlFor="work_start_time">
              Planning day start
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
              Planning day end
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
              Protected focus start
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
              Protected focus end
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
              Preferred focus block
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
          Continue to goals
        </button>
      </form>
    </main>
  );
}
