import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { createClient } from "@/lib/supabase/server";
import { createScheduleBlock, removeScheduleBlock } from "../schedule-block-actions";

type ScheduleBlockRow = {
  id: string;
  title: string;
  category: "school" | "work";
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

function ScheduleBlockList({ blocks }: { blocks: ScheduleBlockRow[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-zinc-600">Nothing added yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {blocks.map((block) => (
        <li key={block.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 p-4">
          <div>
            <p className="font-medium text-zinc-900">{block.title}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {formatDays(block.days_of_week)} · {toTimeInputValue(block.start_time)}-{toTimeInputValue(block.end_time)}
            </p>
          </div>
          <form action={removeScheduleBlock}>
            <input name="id" type="hidden" value={block.id} />
            <input name="return_to" type="hidden" value="/onboarding/schedule" />
            <button className="text-sm text-zinc-600 underline" type="submit">
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function ScheduleBlockForm({
  category,
  title,
  placeholder,
}: {
  category: "school" | "work";
  title: string;
  placeholder: string;
}) {
  return (
    <form action={createScheduleBlock} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <input name="category" type="hidden" value={category} />
      <input name="return_to" type="hidden" value="/onboarding/schedule" />
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-zinc-700" htmlFor={`${category}-title`}>
          Name
        </label>
        <input
          className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
          id={`${category}-title`}
          name="title"
          placeholder={placeholder}
          required
          type="text"
        />
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
          <label className="block text-sm text-zinc-700" htmlFor={`${category}-start-time`}>
            Start
          </label>
          <input
            className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
            id={`${category}-start-time`}
            name="start_time"
            required
            type="time"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-zinc-700" htmlFor={`${category}-end-time`}>
            End
          </label>
          <input
            className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
            id={`${category}-end-time`}
            name="end_time"
            required
            type="time"
          />
        </div>
      </div>

      <button className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" type="submit">
        Add {category === "school" ? "school" : "work"} block
      </button>
    </form>
  );
}

export default async function ScheduleCommitmentsPage({
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

  const { data: blocks } = await supabase
    .from("schedule_blocks")
    .select("id, title, category, days_of_week, start_time, end_time")
    .eq("user_id", user.id)
    .in("category", ["school", "work"])
    .order("start_time", { ascending: true });

  const typedBlocks = (blocks ?? []) as ScheduleBlockRow[];
  const schoolBlocks = typedBlocks.filter((block) => block.category === "school");
  const workBlocks = typedBlocks.filter((block) => block.category === "work");

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Step 1 of 3</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Add school and work</h1>
          <p className="mt-2 max-w-2xl text-zinc-700">
            Add the fixed classes and work shifts Atlas should plan around every week.
          </p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-red-600">{params.error}</p> : null}
      <OnboardingProgress currentStep={1} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <ScheduleBlockForm category="school" placeholder="Ex: Biology lecture" title="School block" />
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">School schedule</h2>
            <ScheduleBlockList blocks={schoolBlocks} />
          </section>
        </div>

        <div className="space-y-4">
          <ScheduleBlockForm category="work" placeholder="Ex: Closing shift" title="Work block" />
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Work schedule</h2>
            <ScheduleBlockList blocks={workBlocks} />
          </section>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white" href="/onboarding">
          Continue
        </Link>
        <Link className="text-sm text-zinc-600 underline" href="/onboarding">
          Skip for now
        </Link>
      </div>
    </main>
  );
}
