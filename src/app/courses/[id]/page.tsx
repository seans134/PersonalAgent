import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { courseGradeFromRows } from "@/lib/courses/grade";
import { getCourseDetail } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { GradeSummary } from "./grade-summary";

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

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="text-sm text-ink-muted">Category editor and items list coming soon.</p>
        </section>
      </div>
    </main>
  );
}
