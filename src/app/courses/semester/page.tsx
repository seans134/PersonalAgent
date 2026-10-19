import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatSemesterDueDay,
  formatSemesterLoad,
  formatSemesterWeekRange,
  semesterCrunchLabel,
  semesterItemMeta,
  type SemesterTimeline,
  type SemesterWeek,
  type SemesterWeekItem,
} from "@personal-agent/core";
import { loadSemesterTimeline } from "@/lib/courses/semester";
import { createClient } from "@/lib/supabase/server";
import { SemesterViewed } from "./semester-viewed";

/** Course link that brings the back link on the course page back here, to the same term. */
function courseHref(courseId: string, term: string | null): string {
  const query = new URLSearchParams({ from: "semester" });
  if (term) query.set("term", term);
  return `/courses/${courseId}?${query.toString()}`;
}

function ItemList({ items, term }: { items: SemesterWeekItem[]; term: string | null }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 transition hover:bg-surface2"
            href={courseHref(item.courseId, term)}
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
  );
}

function WeekCard({ week, term }: { week: SemesterWeek; term: string | null }) {
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
      {week.items.length > 0 ? <ItemList items={week.items} term={term} /> : null}
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

  const retryHref = params.term ? `/courses/semester?term=${encodeURIComponent(params.term)}` : "/courses/semester";
  let timeline: SemesterTimeline;
  try {
    timeline = await loadSemesterTimeline(supabase, user.id, params.term ?? null);
  } catch (error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
        <Link className="text-sm text-teal hover:underline" href="/courses">
          ← Courses
        </Link>
        <h1 className="mb-6 mt-3 font-display text-3xl font-semibold tracking-tight text-ink">Semester</h1>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-danger">{error instanceof Error ? error.message : "Unable to load semester."}</p>
          <Link
            className="mt-3 inline-flex rounded-lg border border-teal px-3 py-2 text-sm font-medium text-teal transition hover:bg-surface2"
            href={retryHref}
          >
            Retry
          </Link>
        </div>
      </main>
    );
  }
  const hasItems = timeline.weeks.length > 0 || timeline.pastWeeks.length > 0 || timeline.laterItems.length > 0;

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
                  <WeekCard key={week.weekStart} term={timeline.term} week={week} />
                ))}
              </div>
            </details>
          ) : null}

          {timeline.weeks.length > 0 ? (
            <div className="space-y-3">
              {timeline.weeks.map((week) => (
                <WeekCard key={week.weekStart} term={timeline.term} week={week} />
              ))}
            </div>
          ) : timeline.laterItems.length === 0 ? (
            <p className="text-ink-muted">Nothing left this term. Everything due is behind you.</p>
          ) : null}

          {timeline.laterItems.length > 0 ? (
            <section aria-label="Later" className="mt-3 rounded-2xl border border-line bg-surface p-4">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Later</h2>
              <p className="mt-1 text-xs text-ink-muted">
                Due more than six months out. If a date looks wrong, fix its year on the course page.
              </p>
              <ItemList items={timeline.laterItems} term={timeline.term} />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
