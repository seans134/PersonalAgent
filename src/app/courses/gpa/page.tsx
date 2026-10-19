import Link from "next/link";
import { redirect } from "next/navigation";
import {
  describeGpaNeeded,
  formatGpa,
  formatGradePercent,
  gpaScale,
  GPA_EXCLUSION_COPY,
  GPA_STATUS_COPY,
  type GpaSummary,
  type GpaTerm,
} from "@personal-agent/core";
import { loadGpaSummary } from "@/lib/courses/gpa";
import { createClient } from "@/lib/supabase/server";
import { GpaViewed } from "./gpa-viewed";

function termName(term: string | null): string {
  return term ?? "No term";
}

function TermCard({ term }: { term: GpaTerm }) {
  const showProjected = !term.isFinal && term.projectedGpa !== null && formatGpa(term.projectedGpa) !== formatGpa(term.gpa);
  return (
    <section aria-label={termName(term.term)} className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">{termName(term.term)}</h2>
        <span className="font-mono text-sm text-ink">
          {formatGpa(term.gpa)} <span className="text-xs text-ink-muted">· {term.credits} cr · {term.isFinal ? "Final" : "In progress"}</span>
        </span>
      </div>
      {showProjected ? (
        <p className="mt-1 text-xs text-ink-muted">At your target grades: {formatGpa(term.projectedGpa)}</p>
      ) : null}
      {term.courses.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs text-ink-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Course</th>
                <th className="py-1 pr-2 font-medium">Credits</th>
                <th className="py-1 pr-2 font-medium">Grade</th>
                <th className="py-1 pr-2 font-medium">Points</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {term.courses.map((course) => (
                <tr className="border-t border-line" key={course.id}>
                  <td className="py-1.5 pr-2">
                    <Link className="text-ink hover:underline" href={`/courses/${course.id}`}>
                      {course.label}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2 font-mono">{course.credits}</td>
                  <td className="py-1.5 pr-2 font-mono">
                    {course.letter}
                    {course.percent !== null ? <span className="text-ink-muted"> ({formatGradePercent(course.percent)})</span> : null}
                  </td>
                  <td className="py-1.5 pr-2 font-mono">{course.points.toFixed(1)}</td>
                  <td className={`py-1.5 text-xs ${course.status === "final" ? "text-ink" : "text-ink-muted"}`}>
                    {GPA_STATUS_COPY[course.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No grades yet this term.</p>
      )}
    </section>
  );
}

export default async function GpaPage({ searchParams }: { searchParams: Promise<{ target?: string; term?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const targetText = params.target?.trim() ?? "";
  const target = targetText ? Number(targetText) : null;
  const targetGpa = target !== null && Number.isFinite(target) && target > 0 ? target : null;

  let summary: GpaSummary;
  try {
    summary = await loadGpaSummary(supabase, user.id, { targetGpa, term: params.term ?? null });
  } catch (error) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
        <Link className="text-sm text-teal hover:underline" href="/courses">
          ← Courses
        </Link>
        <h1 className="mb-6 mt-3 font-display text-3xl font-semibold tracking-tight text-ink">GPA</h1>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-danger">{error instanceof Error ? error.message : "Unable to load GPA."}</p>
          <Link
            className="mt-3 inline-flex rounded-lg border border-teal px-3 py-2 text-sm font-medium text-teal transition hover:bg-surface2"
            href="/courses/gpa"
          >
            Retry
          </Link>
        </div>
      </main>
    );
  }

  const scale = gpaScale(summary.scale);
  const neededCopy = describeGpaNeeded(summary.needed);
  const { cumulative, projection } = summary;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <Link className="text-sm text-teal hover:underline" href="/courses">
        ← Courses
      </Link>
      <div className="mb-6 mt-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">GPA</h1>
        <p className="mt-2 text-ink-muted">
          Weighted by credits on the {scale.label}.{" "}
          <Link className="text-teal hover:underline" href="/profile">
            Change scale in Profile
          </Link>
          .
        </p>
      </div>

      <GpaViewed courseCount={summary.courseCount} termCount={summary.terms.length} />

      <section aria-label="Cumulative GPA" className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-muted">Cumulative</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-4xl font-semibold tracking-tight text-ink">{formatGpa(cumulative.gpa)}</span>
          <span className="font-mono text-sm text-ink-muted">
            {cumulative.credits} credits{cumulative.inProgressCredits > 0 ? `, ${cumulative.inProgressCredits} in progress` : ""}
          </span>
        </div>
        {cumulative.inProgressCredits > 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            Final grades only: {formatGpa(cumulative.finalGpa)} over {cumulative.finalCredits} credits. In-progress courses
            count at their current grade.
          </p>
        ) : null}
        {projection.targetCourseCount > 0 ? (
          <p className="mt-2 text-sm text-ink">
            If you hit your target grades: <span className="font-mono font-semibold">{formatGpa(projection.gpa)}</span>
          </p>
        ) : null}

        <form action="/courses/gpa" className="mt-4 flex flex-wrap items-end gap-2" method="get">
          {params.term ? <input name="term" type="hidden" value={params.term} /> : null}
          <label className="text-sm font-medium text-ink">
            Cumulative target
            <input
              className="mt-1 block w-28 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
              defaultValue={targetGpa !== null ? String(targetGpa) : ""}
              inputMode="decimal"
              max={scale.max}
              min={0.01}
              name="target"
              placeholder={scale.max === 4 ? "3.70" : "3.90"}
              step="0.01"
              type="number"
            />
          </label>
          <button
            className="rounded-lg border border-teal px-3 py-2 text-sm font-medium text-teal transition hover:bg-surface2"
            type="submit"
          >
            What do I need?
          </button>
        </form>
        {neededCopy ? (
          <p className={`mt-3 text-sm ${summary.needed.status === "out_of_reach" ? "text-warning" : "text-ink"}`} role="status">
            {neededCopy}
          </p>
        ) : null}
      </section>

      {summary.terms.length > 0 ? (
        <div className="space-y-3">
          {summary.terms.map((term) => (
            <TermCard key={term.term ?? ""} term={term} />
          ))}
        </div>
      ) : (
        <p className="text-ink-muted">
          No courses count toward your GPA yet. Add credits to a course from its Course details, and grades as they come
          in.
        </p>
      )}

      {summary.excluded.length > 0 ? (
        <section aria-label="Not counted" className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Not counted</h2>
          <p className="mt-1 text-xs text-ink-muted">Set credits in Course details, or add a grade, to count these.</p>
          <ul className="mt-2 space-y-1">
            {summary.excluded.map((course) => (
              <li className="flex flex-wrap items-baseline justify-between gap-2 text-sm" key={course.id}>
                <Link className="text-ink hover:underline" href={`/courses/${course.id}`}>
                  {course.label}
                  {course.term ? <span className="text-ink-muted"> · {course.term}</span> : null}
                </Link>
                <span className="text-xs text-ink-muted">{GPA_EXCLUSION_COPY[course.reason]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
