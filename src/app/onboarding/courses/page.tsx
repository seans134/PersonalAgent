import Link from "next/link";
import { redirect } from "next/navigation";
import { NewCourseForm } from "@/app/courses/new-course-form";
import { SyllabusImportPanel } from "@/app/courses/syllabus-import-panel";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { isGeminiConfigured } from "@/lib/gemini/client";
import { isOnboardingComplete } from "@/lib/onboarding/status";
import { createClient } from "@/lib/supabase/server";

type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
};

export default async function OnboardingCoursesPage({
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

  const onboarded = await isOnboardingComplete(supabase, user.id);

  const [{ data: courses }, { count: classTimeCount }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, code, term")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("schedule_blocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("category", "school"),
  ]);

  const courseRows = (courses ?? []) as CourseRow[];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          {!onboarded ? (
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Step 1 of 3</p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Add your courses</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Upload each syllabus and Atlas pulls in the grade weights and due dates it needs to plan your studying. You
            can import several, one after another.
          </p>
        </div>
        <Link className="text-sm text-ink-muted underline" href="/">
          Back home
        </Link>
      </div>

      {params.error ? <p className="mb-4 text-sm text-danger">{params.error}</p> : null}
      {!onboarded ? (
        <OnboardingProgress
          currentStep="courses"
          progress={{ courseCount: courseRows.length, classTimeCount: classTimeCount ?? 0 }}
        />
      ) : null}

      <section className="mb-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Your courses</h2>
        {courseRows.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {courseRows.map((course) => (
              <li className="flex flex-wrap items-baseline gap-x-3 py-2" key={course.id}>
                <span className="font-medium text-ink">{course.name}</span>
                {course.code || course.term ? (
                  <span className="text-sm text-ink-muted">{[course.code, course.term].filter(Boolean).join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No courses yet. Import a syllabus below to add your first one.</p>
        )}
      </section>

      <div className="space-y-6">
        <SyllabusImportPanel afterApply="stay" geminiConfigured={isGeminiConfigured()} />
        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink">Add a course manually</summary>
          <div className="mt-4">
            <NewCourseForm returnTo="/onboarding/courses" />
          </div>
        </details>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" href="/onboarding/schedule">
          {onboarded ? "Class times" : "Continue"}
        </Link>
        {!onboarded && courseRows.length === 0 ? (
          <Link className="text-sm text-ink-muted underline" href="/onboarding/schedule">
            Skip for now
          </Link>
        ) : null}
      </div>
    </main>
  );
}
