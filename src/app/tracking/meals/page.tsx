import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MealLogForm } from "./meal-log-form";
import { MealLogList, type MealLogListItem } from "./meal-log-list";
import { NaturalLanguageMealPanel } from "./natural-language-meal-panel";

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return Number(value).toLocaleString();
}

function sumNullable(
  rows: MealLogListItem[],
  key: "calories" | "protein_grams" | "carbs_grams" | "fat_grams" | "fiber_grams",
) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

export default async function TrackMealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { start, end } = todayBounds();
  const { data: mealLogs, error } = await supabase
    .from("meal_logs")
    .select("id, logged_at, meal_type, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
    .eq("user_id", user.id)
    .gte("logged_at", start.toISOString())
    .lte("logged_at", end.toISOString())
    .order("logged_at", { ascending: false });

  const meals = (mealLogs ?? []) as MealLogListItem[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Tracking</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Track meals</h1>
          <p className="mt-2 max-w-2xl text-zinc-700">Log meals and review today&apos;s nutrition totals.</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error.message}
        </p>
      ) : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Meals</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{meals.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Calories</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatNumber(sumNullable(meals, "calories"))}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Protein g</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatNumber(sumNullable(meals, "protein_grams"))}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Carbs g</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatNumber(sumNullable(meals, "carbs_grams"))}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Fat g</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatNumber(sumNullable(meals, "fat_grams"))}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Fiber g</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatNumber(sumNullable(meals, "fiber_grams"))}</p>
        </div>
      </div>

      <NaturalLanguageMealPanel mode="log" />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Saved meals</h2>
                <p className="mt-1 text-sm text-zinc-600">Track meals you have saved before.</p>
              </div>
              <Link
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
                href="/tracking/meals/saved"
              >
                Saved meals
              </Link>
            </div>
          </section>
          <MealLogForm />
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Today&apos;s meals</h2>
          <MealLogList meals={meals} />
        </section>
      </div>
    </main>
  );
}
