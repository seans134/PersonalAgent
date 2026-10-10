import type { GradeCategory, GradedItem, NeededScore } from "./types";

// The projected final grade is linear in the percent assumed on ungraded work:
// final(p) = base + slope * p, with base and slope in final-grade points (0-100 scale).
// slope * 100 is the share of the final grade that is still ungraded.
type Projection = { base: number; slope: number };

function buildProjection(categories: GradeCategory[], items: GradedItem[]): Projection | null {
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  if (categories.length === 0 || !(totalWeight > 0)) return null;

  const buckets = new Map<string, { earned: number; gradedMax: number; ungradedMax: number }>();
  for (const category of categories) {
    buckets.set(category.id, { earned: 0, gradedMax: 0, ungradedMax: 0 });
  }

  for (const item of items) {
    if (item.categoryId === null || !(item.scoreMax > 0)) continue;
    const bucket = buckets.get(item.categoryId);
    if (!bucket) continue;
    if (item.scoreEarned !== null && Number.isFinite(item.scoreEarned)) {
      bucket.earned += item.scoreEarned;
      bucket.gradedMax += item.scoreMax;
    } else {
      bucket.ungradedMax += item.scoreMax;
    }
  }

  let base = 0;
  let slope = 0;
  for (const category of categories) {
    const bucket = buckets.get(category.id)!;
    const share = category.weight / totalWeight;
    const max = bucket.gradedMax + bucket.ungradedMax;
    if (max > 0) {
      base += share * (bucket.earned / max) * 100;
      slope += share * (bucket.ungradedMax / max);
    } else {
      // No gradable items yet: the whole category comes in at the assumed percent.
      slope += share;
    }
  }
  return { base, slope };
}

/** Final course grade (0-100) if every ungraded item scores `assumedPercent`. */
export function projectFinalGrade(
  categories: GradeCategory[],
  items: GradedItem[],
  assumedPercent: number,
): number | null {
  const projection = buildProjection(categories, items);
  if (!projection) return null;
  return projection.base + projection.slope * assumedPercent;
}

/** Average percent needed on all remaining ungraded work to finish at `targetGrade`. */
export function computeNeededScore(
  categories: GradeCategory[],
  items: GradedItem[],
  targetGrade: number | null,
): NeededScore {
  if (targetGrade === null || !Number.isFinite(targetGrade)) return { status: "no_target" };
  const projection = buildProjection(categories, items);
  if (!projection) return { status: "no_categories" };

  const { base, slope } = projection;
  if (slope <= 0) {
    return { status: "nothing_left", finalGrade: base, met: base >= targetGrade, remainingWeight: 0 };
  }

  const remainingWeight = slope * 100;
  const neededPercent = (targetGrade - base) / slope;
  if (neededPercent <= 0) return { status: "secured", neededPercent, remainingWeight };
  if (neededPercent > 100) {
    return { status: "out_of_reach", neededPercent, maxPossible: base + slope * 100, remainingWeight };
  }
  return { status: "needed", neededPercent, remainingWeight };
}
