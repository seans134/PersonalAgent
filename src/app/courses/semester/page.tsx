import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatSemesterDueDay,
  formatSemesterLoad,
  formatSemesterWeekRange,
  semesterCrunchLabel,
  semesterItemMeta,
  type SemesterWeek,
} from "@personal-agent/core";
import { loadSemesterTimeline } from "@/lib/courses/semester";
import { createClient } from "@/lib/supabase/server";
import { SemesterViewed } from "./semester-viewed";

function WeekCard({ week }: { week: SemesterWeek }) {
  const crunch = semesterCrunchLabel(week);
  return (
    <section
      aria-label={`Week of ${formatSemesterWeekRange(week)}`}
      className={`rounded-2xl border bg-surface p-4 ${crunch ? "border-warning" : "border-line"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          {formatSemesterWeekRange(week)}
          {week.isCurrent ? <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.08em] text-teal">This week</span> : null}
        </h2>
        <span className="font-mono text-xs text-ink-muted">{formatSemesterLoad(week)}</span>
      </div>
      {crunch ? (
        <p className="mt-2 inline-flex rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">{crunch}</p>
      ) : null}
      {week.items.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {week.items.map((item) => (
            <li key={item.id}>
              <Link
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 transition hover:bg-surface2"
                href={`/courses/${item.courseId}`}
              >
                <span className={`text-sm ${item.isDone ? "text-ink-muted line-through" : "text-ink"}`}>
                  <span className="font-medium">{item.courseLabel}</span> {item.title}
                  {item.isDone ? <span className="sr-only"> (done)</span> : null}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  {formatSemesterDueDay(item.dueLocalDate)} · {semesterItemMeta(item)}
                  {item.isDone ? " · Done" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function SemesterPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const timeline = await loadSemesterTimeline(supabase, user.id, params.term ?? null);
  const hasItems = timeline.weeks.length > 0 || timeline.pastWeeks.length > 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <Link className="text-sm text-teal hover:underline" href="/courses">
        ← Courses
      </Link>
      <div className="mb-6 mt-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Semester</h1>
        <p className="mt-2 text-ink-muted">
          Every exam and deadline{timeline.term ? ` in ${timeline.term}` : ""}, week by week, so you can see crunch weeks
          coming.
        </p>
      </div>

      {timeline.terms.length > 1 ? (
        <nav aria-label="Term" className="mb-6 flex flex-wrap gap-2">
          {timeline.terms.map((term) => (
            <Link
              aria-current={term === timeline.term ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                term === timeline.term ? "border-teal bg-teal text-on-teal" : "border-line text-ink-muted hover:bg-surface2 hover:text-ink"
              }`}
              href={`/courses/semester?term=${encodeURIComponent(term)}`}
              key={term}
            >
              {term}
            </Link>
          ))}
        </nav>
      ) : null}

      <SemesterViewed
        crunchWeekCount={timeline.crunchWeekCount}
        term={timeline.term ?? ""}
        weekCount={timeline.weeks.length}
      />

      {!hasItems ? (
        <p className="text-ink-muted">
          No dated exams or deadlines yet. Add them to a course, or import a syllabus from{" "}
          <Link className="text-teal hover:underline" href="/courses">
            Courses
          </Link>
          .
        </p>
      ) : (
        <>
          {timeline.pastWeeks.length > 0 ? (
            <details className="mb-4 rounded-2xl border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-muted">
                Earlier weeks ({timeline.pastWeeks.length})
              </summary>
              <div className="mt-4 space-y-3">
                {timeline.pastWeeks.map((week) => (
                  <WeekCard key={week.weekStart} week={week} />
                ))}
              </div>
            </details>
          ) : null}

          {timeline.weeks.length > 0 ? (
            <div className="space-y-3">
              {timeline.weeks.map((week) => (
                <WeekCard key={week.weekStart} week={week} />
              ))}
            </div>
          ) : (
            <p className="text-ink-muted">Nothing left this term. Everything due is behind you.</p>
          )}
        </>
      )}
    </main>
  );
}
