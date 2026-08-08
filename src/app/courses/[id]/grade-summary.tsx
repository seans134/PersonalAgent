"use client";

import type { CourseGrade } from "@personal-agent/core";
import { BulletBar } from "@/components/bullet-bar";
import { formatGrade } from "@/components/grade-format";
import type { CourseRow } from "@/lib/courses/types";

export function GradeSummary({
  course,
  grade,
}: {
  course: CourseRow;
  grade: CourseGrade;
}) {
  const averageLabel = formatGrade(grade.average);
  const targetLabel = course.target_grade !== null ? formatGrade(course.target_grade) : null;
  const weightSum = grade.categories.reduce((sum, category) => sum + Number(category.weight), 0);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-4xl font-semibold tracking-tight text-ink">{averageLabel}</span>
          {targetLabel ? <span className="font-mono text-xs text-ink-muted">Target {targetLabel}</span> : null}
        </div>
        <div className="mt-3">
          <BulletBar
            ariaLabel={`Course average ${averageLabel}${targetLabel ? `, target ${targetLabel}` : ""}`}
            target={course.target_grade}
            value={grade.average}
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">Based on {grade.gradedWeight}% of your final grade</p>
      </div>

      {grade.warnings.includes("weights_sum_not_100") ? (
        <p className="rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-warning">
          Category weights sum to {weightSum}%, not 100%.
        </p>
      ) : null}

      {grade.categories.length > 0 ? (
        <div className="overflow-x-auto">
          <div className="flex min-w-[240px] flex-col gap-4">
            {grade.categories.map((category) => {
              const scoreLabel = formatGrade(category.score);
              return (
                <div className="flex flex-col gap-1.5" key={category.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {category.name} <span className="text-ink-muted">{category.weight}%</span>
                    </span>
                    <span className="font-mono text-sm text-ink">{scoreLabel}</span>
                  </div>
                  <BulletBar ariaLabel={`${category.name} ${scoreLabel}`} value={category.score} />
                  <p className="text-xs text-ink-muted">
                    {category.gradedCount} of {category.itemCount} graded
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No categories yet.</p>
      )}
    </div>
  );
}
