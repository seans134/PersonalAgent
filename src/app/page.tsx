import Link from "next/link";
import { examLabel, examsWithinDays, features, formatDaysAway } from "@personal-agent/core";
import { createClient } from "@/lib/supabase/server";
import { StartStudyButton } from "@/components/study-timer/study-timer-bar";
import { TodayPlanPanel } from "@/components/today-plan-panel";
import { formatGrade } from "@/components/grade-format";
import { listCourseSummaries } from "@/lib/courses/queries";
import type { CourseSummaryDTO } from "@/lib/courses/types";

function formatShortDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone });
}

const UPCOMING_EXAM_DAYS = 14;

// Falls back to the server's zone if the saved value isn't a valid IANA name.
function validTimeZone(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

async function loadCourses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CourseSummaryDTO[]> {
  try {
    return await listCourseSummaries(supabase, userId);
  } catch {
    // Today should still render if courses fail to load.
    return [];
  }
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("work_start_time, work_end_time, focus_block_minutes, workout_preference, timezone")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  const { count: activeGoalsCount } = user
    ? await supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("completed_at", null)
    : { count: 0 };

  const { count: completedGoalsCount } = user
    ? await supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("completed_at", "is", null)
    : { count: 0 };

  const courses = user ? await loadCourses(supabase, user.id) : [];
  const dueThisWeekCount = courses.reduce((total, course) => total + course.dueThisWeek, 0);
  // Day counts follow the student's saved timezone, not the server's.
  const timeZone = validTimeZone(profile?.timezone);
  const upcomingExams = examsWithinDays(
    courses.flatMap((course) => (course.nextExam ? [{ ...course.nextExam, course }] : [])),
    new Date(),
    UPCOMING_EXAM_DAYS,
    timeZone,
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { count: mealsLoggedCount } = user && features.wellnessTracking
    ? await supabase
        .from("meal_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("logged_at", todayStart.toISOString())
        .lte("logged_at", todayEnd.toISOString())
    : { count: 0 };

  const { count: workoutsLoggedCount } = user && features.wellnessTracking
    ? await supabase
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("logged_at", todayStart.toISOString())
        .lte("logged_at", todayEnd.toISOString())
    : { count: 0 };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
      <header className="mb-8">
        <p className="flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-teal">
          <span className="inline-block h-px w-6 bg-teal" aria-hidden="true" />
          Atlas · Study Planner
        </p>
        <h1 className="mt-3 text-balance font-display text-4xl font-bold tracking-tight text-ink">Know what to study today.</h1>
        <p className="mt-3 max-w-xl text-ink-muted">
          {features.wellnessTracking
            ? "Goals, calendar, meals, and training — routed into a single plan, with the times kept honest."
            : "Your classes, deadlines, and exams, turned into a daily study plan."}
        </p>
      </header>

      {!user ? (
        <section className="rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
          <p className="mb-4 text-ink-muted">Sign in to add your courses and get a daily study plan.</p>
          <Link
            className="inline-flex rounded-[11px] bg-teal px-5 py-2.5 font-display text-sm font-medium text-on-teal transition hover:bg-teal-strong"
            href="/auth"
          >
            Sign in
          </Link>
        </section>
      ) : (
        <div className="space-y-4">
          <section className="space-y-4 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
            <p className="font-mono text-[12px] text-ink-muted">Signed in as {user.email}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Due this week", value: dueThisWeekCount },
                { label: "Courses", value: courses.length },
                { label: "Active goals", value: activeGoalsCount ?? 0 },
                { label: "Completed goals", value: completedGoalsCount ?? 0 },
                ...(features.wellnessTracking
                  ? [
                      { label: "Meals today", value: mealsLoggedCount ?? 0 },
                      { label: "Workouts today", value: workoutsLoggedCount ?? 0 },
                    ]
                  : []),
              ].map((stat) => (
                <div className="rounded-[12px] border border-line bg-surface2 p-4" key={stat.label}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">{stat.label}</p>
                  <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{stat.value}</p>
                </div>
              ))}
            </div>
            <p className="font-mono text-[12px] text-ink-muted">
              Work {profile?.work_start_time ?? "--:--"}–{profile?.work_end_time ?? "--:--"}
              {features.wellnessTracking ? ` · Workout: ${profile?.workout_preference ?? "none"}` : null}
            </p>
          </section>
          {upcomingExams.length > 0 ? (
            <section className="space-y-3 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Upcoming exams</h2>
              <ul className="divide-y divide-line">
                {upcomingExams.map((exam) => (
                  <li className="flex items-center gap-3" key={exam.id}>
                    <Link
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 py-3 transition hover:text-teal"
                      href={`/courses/${exam.course.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{examLabel(exam.course, exam.title)}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {exam.course.name} · {formatShortDate(exam.dueAt, timeZone)}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-teal">
                        {formatDaysAway(exam.daysAway)}
                      </p>
                    </Link>
                    <StartStudyButton className="shrink-0" label="Study" target={{ courseId: exam.course.id, courseItemId: exam.id }} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <TodayPlanPanel />
          <section className="space-y-4 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Your courses</h2>
              <Link className="text-sm font-medium text-teal hover:text-teal-strong" href="/courses">
                {courses.length > 0 ? "All courses" : "Add a course"}
              </Link>
            </div>
            {courses.length > 0 ? (
              <ul className="divide-y divide-line">
                {courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      className="flex items-center justify-between gap-4 py-3 transition hover:text-teal"
                      href={`/courses/${course.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{course.name}</p>
                        <p className="truncate text-sm text-ink-muted">
                          {course.nextItem
                            ? `Next: ${course.nextItem.title} · ${formatShortDate(course.nextItem.dueAt)}`
                            : "Nothing due yet"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-lg font-semibold text-ink">{formatGrade(course.average)}</p>
                        {course.dueThisWeek > 0 ? (
                          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-teal">
                            {course.dueThisWeek} due this week
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">
                Add your courses to see grades and what&apos;s due, and to get study time in your plan.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
