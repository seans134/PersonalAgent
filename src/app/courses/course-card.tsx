import Link from "next/link";
import { BulletBar } from "@/components/bullet-bar";
import { formatGrade } from "@/components/grade-format";
import type { CourseSummaryDTO } from "@/lib/courses/types";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CourseCard({
  course,
  isNextUp,
}: {
  course: CourseSummaryDTO;
  isNextUp: boolean;
}) {
  const meta = [course.code, course.term].filter(Boolean).join(" · ");
  const targetLabel = course.targetGrade !== null ? formatGrade(course.targetGrade) : null;

  return (
    <Link
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:border-line-strong hover:shadow-[var(--shadow-md)]"
      href={`/courses/${course.id}`}
    >
      <div>
        <p className="font-display text-lg font-semibold tracking-tight text-ink">{course.name}</p>
        {meta ? <p className="mt-1 text-sm text-ink-muted">{meta}</p> : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-3xl font-semibold tracking-tight text-ink">{formatGrade(course.average)}</span>
          {targetLabel ? <span className="font-mono text-xs text-ink-muted">Target {targetLabel}</span> : null}
        </div>
        <div className="mt-2">
          <BulletBar
            ariaLabel={`${course.name} average ${formatGrade(course.average)}${targetLabel ? `, target ${targetLabel}` : ""}`}
            target={course.targetGrade}
            value={course.average}
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">Based on {course.gradedWeight}% of your grade so far</p>
      </div>

      {course.nextItem ? (
        <p
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isNextUp ? "bg-compass-soft text-compass" : "bg-surface2 text-ink-muted"
          }`}
        >
          Next: {course.nextItem.title} · {formatShortDate(course.nextItem.dueAt)}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">No upcoming items</p>
      )}
    </Link>
  );
}
