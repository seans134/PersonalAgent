import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { courseGradeFromRows } from "@/lib/courses/grade";
import { getCourseDetail } from "@/lib/courses/queries";
import type { CourseItemRow } from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";
import { CategoryEditor } from "./category-editor";
import { GradeSummary } from "./grade-summary";
import { AddItemPanel } from "./item-form";
import { ItemRow } from "./item-row";

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const detail = await getCourseDetail(supabase, user.id, id);
  if (!detail) {
    notFound();
  }

  const { course, categories, items } = detail;
  const grade = courseGradeFromRows(categories, items);
  const meta = [course.code, course.term].filter(Boolean).join(" · ");

  const itemsByCategory = new Map<string, CourseItemRow[]>();
  for (const item of items) {
    const key = item.category_id ?? "uncategorized";
    const list = itemsByCategory.get(key) ?? [];
    list.push(item);
    itemsByCategory.set(key, list);
  }
  const itemGroups = [
    ...categories.map((category) => ({
      key: category.id,
      name: category.name,
      items: itemsByCategory.get(category.id) ?? [],
    })),
    { key: "uncategorized", name: "Uncategorized", items: itemsByCategory.get("uncategorized") ?? [] },
  ].filter((group) => group.items.length > 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <div className="mb-8">
        <Link className="text-sm text-ink-muted underline" href="/courses">
          Back to courses
        </Link>
        <div className="mt-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{course.name}</h1>
          {meta ? <p className="mt-2 text-ink-muted">{meta}</p> : null}
        </div>
      </div>

      {error ? (
        <p className="mb-6 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <GradeSummary course={course} grade={grade} />
        </aside>

        <section className="flex flex-col gap-6">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Categories</h2>
            <div className="mt-4">
              <CategoryEditor categories={categories} courseId={course.id} />
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Items</h2>

            <div className="mt-4 flex flex-col gap-6">
              {itemGroups.length > 0 ? (
                itemGroups.map((group) => (
                  <div className="flex flex-col gap-2" key={group.key}>
                    <h3 className="text-sm font-medium text-ink-muted">{group.name}</h3>
                    <div className="flex flex-col gap-2 overflow-x-auto">
                      {group.items.map((item) => (
                        <ItemRow categories={categories} item={item} key={item.id} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-muted">No items yet. Add an assignment, quiz, or exam below.</p>
              )}
            </div>

            <div className="mt-6">
              <AddItemPanel categories={categories} courseId={course.id} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
