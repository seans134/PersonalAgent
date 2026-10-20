import Link from "next/link";
import { redirect } from "next/navigation";
import { listCourseSummaries } from "@/lib/courses/queries";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { createClient } from "@/lib/supabase/server";
import { CourseCard } from "./course-card";
import { LmsFeedPanel } from "./lms-feed-panel";
import { NewCourseForm } from "./new-course-form";
import { SyllabusImportPanel } from "./syllabus-import-panel";

export default async function CoursesPage({
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

  const courses = await listCourseSummaries(supabase, user.id, { includeArchived: true });
  const activeCourses = courses.filter((course) => course.archivedAt === null);
  const archivedCourses = courses.filter((course) => course.archivedAt !== null);

  let nextUpCourseId: string | null = null;
  let nextUpDueAt = "";
  for (const course of activeCourses) {
    if (!course.nextItem) continue;
    if (nextUpCourseId === null || course.nextItem.dueAt < nextUpDueAt) {
      nextUpCourseId = course.id;
      nextUpDueAt = course.nextItem.dueAt;
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Courses</h1>
        <p className="mt-2 text-ink-muted">Track grades, deadlines, and progress toward your target in every course.</p>
        <Link
          className="mt-4 inline-flex rounded-lg border border-teal px-3 py-2 text-sm font-medium text-teal transition hover:bg-surface2"
          href="/courses/semester"
        >
          Semester view: every exam and deadline by week
        </Link>
        <Link
          className="ml-2 mt-4 inline-flex rounded-lg border border-teal px-3 py-2 text-sm font-medium text-teal transition hover:bg-surface2"
          href="/courses/gpa"
        >
          GPA by term
        </Link>
      </div>

      {params.error ? (
        <p className="mb-6 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{params.error}</p>
      ) : null}

      <div className="mb-8 space-y-6">
        <SyllabusImportPanel geminiConfigured={isGeminiConfigured()} />
        <LmsFeedPanel
          courses={activeCourses.map((course) => ({ id: course.id, name: course.name, code: course.code }))}
        />
        <NewCourseForm />
      </div>

      {activeCourses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeCourses.map((course) => (
            <CourseCard course={course} isNextUp={course.id === nextUpCourseId} key={course.id} />
          ))}
        </div>
      ) : (
        <p className="text-ink-muted">No courses yet. Import a syllabus or add a course above to get started.</p>
      )}

      {archivedCourses.length > 0 ? (
        <details className="mt-10 rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted">
            Archived courses ({archivedCourses.length})
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archivedCourses.map((course) => (
              <CourseCard course={course} isNextUp={false} key={course.id} />
            ))}
          </div>
        </details>
      ) : null}
    </main>
  );
}
