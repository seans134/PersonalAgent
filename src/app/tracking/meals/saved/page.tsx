import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NaturalLanguageMealPanel } from "../natural-language-meal-panel";
import { SavedMealForm } from "./saved-meal-form";
import { SavedMealList, type SavedMealListItem } from "./saved-meal-list";

export default async function SavedMealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: savedMealRows, error } = await supabase
    .from("saved_meals")
    .select("id, name, calories, protein_grams, carbs_grams, fat_grams, fiber_grams, notes")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const savedMeals = (savedMealRows ?? []) as SavedMealListItem[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Tracking</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Saved meals</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">Track a saved meal again without re-entering its macros.</p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/tracking/meals">
          Back to meals
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-danger bg-surface px-4 py-3 text-sm text-danger">
          Error: {error.message}
        </p>
      ) : null}

      <NaturalLanguageMealPanel mode="saved" />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <SavedMealForm />

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Trackable meals</h2>
          <SavedMealList savedMeals={savedMeals} />
        </section>
      </div>
    </main>
  );
}
