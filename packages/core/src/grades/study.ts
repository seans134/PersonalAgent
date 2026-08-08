import type { StudyFocusMode, StudyTask } from "../planner/types";

export type StudyItem = {
  id: string;
  title: string;
  courseName: string;
  kind: "assignment" | "quiz" | "exam";
  dueLocalDate: string;
  scoreEarned: number | null;
  estimatedEffortHours: number | null;
  focusMode: StudyFocusMode;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function diffInDays(fromLocalDate: string, toLocalDate: string): number {
  const from = Date.parse(`${fromLocalDate}T00:00:00Z`);
  const to = Date.parse(`${toLocalDate}T00:00:00Z`);
  return Math.round((from - to) / DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function kindNoun(kind: StudyItem["kind"]): string {
  return kind === "exam" ? "Exam" : kind === "quiz" ? "Quiz" : "Due";
}

export function deriveStudyTasks(items: StudyItem[], todayLocalDate: string, horizonDays = 7): StudyTask[] {
  const active = items.filter((item) => item.scoreEarned === null && diffInDays(item.dueLocalDate, todayLocalDate) >= 0);
  const hasActiveFinishFirst = active.some((item) => item.focusMode === "finish_first");

  const eligible = active.filter((item) => {
    if (item.estimatedEffortHours === null || !(item.estimatedEffortHours > 0)) return false;
    if (item.focusMode === "deferred" && hasActiveFinishFirst) return false;
    const daysUntilDue = Math.max(1, diffInDays(item.dueLocalDate, todayLocalDate));
    return daysUntilDue <= horizonDays;
  });

  const sortedEligible = [...eligible].sort((a, b) => {
    const aFF = a.focusMode === "finish_first" ? 0 : 1;
    const bFF = b.focusMode === "finish_first" ? 0 : 1;
    if (aFF !== bFF) return aFF - bFF;

    const daysAUntilDue = Math.max(1, diffInDays(a.dueLocalDate, todayLocalDate));
    const daysBUntilDue = Math.max(1, diffInDays(b.dueLocalDate, todayLocalDate));

    // NOTE: keep this priority formula in sync with the other occurrence in this file.
    const aPriority: 1 | 2 | 3 = a.focusMode === "finish_first" ? 1 : daysAUntilDue <= 1 ? 1 : daysAUntilDue <= 3 ? 2 : 3;
    const bPriority: 1 | 2 | 3 = b.focusMode === "finish_first" ? 1 : daysBUntilDue <= 1 ? 1 : daysBUntilDue <= 3 ? 2 : 3;

    if (aPriority !== bPriority) return aPriority - bPriority;

    if (a.dueLocalDate !== b.dueLocalDate) return a.dueLocalDate < b.dueLocalDate ? -1 : 1;
    return 0;
  });

  const tasks: StudyTask[] = sortedEligible.map((item) => {
    const daysUntilDue = Math.max(1, diffInDays(item.dueLocalDate, todayLocalDate));
    const evenShare = Math.round(((item.estimatedEffortHours as number) * 60) / daysUntilDue);
    const isFinishFirst = item.focusMode === "finish_first";
    const durationMinutes = isFinishFirst
      ? clamp(Math.max(45, evenShare * 2), 15, 120)
      : clamp(evenShare, 15, 120);
    // NOTE: keep this priority formula in sync with the other occurrence in this file.
    const priority: 1 | 2 | 3 = isFinishFirst ? 1 : daysUntilDue <= 1 ? 1 : daysUntilDue <= 3 ? 2 : 3;
    const daysWord = daysUntilDue === 1 ? "tomorrow" : `in ${daysUntilDue} days`;
    return {
      id: item.id,
      title: `Study: ${item.title}`,
      reason: `${item.courseName} · ${kindNoun(item.kind)} ${daysWord} · reserving study time.`,
      durationMinutes,
      priority,
      focusMode: item.focusMode,
    };
  });

  return tasks;
}
