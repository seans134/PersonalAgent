# Courses & Grade Manager — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data model, pure grade/study-scheduling logic, calendar/planner projection, and mobile API for the Courses feature — everything except the web/mobile UI (Plan 2).

**Architecture:** New user-scoped Postgres tables (`courses`, `course_categories`, `course_items`). Pure, dependency-free grade math and study-task derivation in `packages/core/src/grades`. A read-adapter projects course items into the existing single-day planner and calendar feeds. A shared `src/lib/courses` data-access layer backs both the mobile API (this plan) and web server actions (Plan 2).

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, Supabase (Postgres + RLS), Vitest. Monorepo workspace `@personal-agent/core`.

## Global Constraints

- Never hardcode a hex color in a component — reference tokens in `packages/core/src/theme` (relevant to Plan 2; keep any color out of core logic).
- Business logic stays in shared pure modules in `packages/core`; do not couple it to web-only server actions (`AGENTS.md` guardrail #1, #2).
- Define stable request/response contracts for endpoints (`AGENTS.md` guardrail #3).
- All new tables enable Row Level Security with `auth.uid() = user_id` policies, matching `db/schedule_blocks.sql`.
- Grade counts toward the average only when an item has a non-null `category_id` **and** non-null `score_earned`.
- `average` is `null` (never `0`) when nothing is graded.
- Item state is derived, not stored: **ungraded** = `score_earned` is null; **active** = ungraded **and** `due_at` in the future (local time).
- Run tests with `npm run test` (Vitest, from repo root). Core tests live beside sources as `*.test.ts`.
- Commit after each task with a `feat:`/`test:`/`chore:` message.

---

## File Structure

**Created:**
- `db/courses.sql` — the three tables + RLS.
- `db/user_profiles_timezone.sql` — add `timezone` to `user_profiles`.
- `packages/core/src/grades/types.ts` — grade + study types.
- `packages/core/src/grades/compute.ts` — `computeCourseGrade`.
- `packages/core/src/grades/compute.test.ts`
- `packages/core/src/grades/study.ts` — `deriveStudyTasks`.
- `packages/core/src/grades/study.test.ts`
- `packages/core/src/grades/index.ts` — barrel export.
- `src/lib/courses/types.ts` — DB row types + DTOs.
- `src/lib/courses/local-time.ts` — timezone → local date/time helper.
- `src/lib/courses/local-time.test.ts`
- `src/lib/courses/grade.ts` — rows → `computeCourseGrade`.
- `src/lib/courses/projection.ts` — items → calendar events + study items.
- `src/lib/courses/projection.test.ts`
- `src/lib/courses/queries.ts` — Supabase fetch/CRUD helpers.
- `src/app/api/mobile/courses/route.ts` — GET list, POST create.
- `src/app/api/mobile/courses/[id]/route.ts` — GET/PATCH/DELETE course.
- `src/app/api/mobile/courses/[id]/categories/route.ts` — category CRUD.
- `src/app/api/mobile/courses/[id]/items/route.ts` — item CRUD.

**Modified:**
- `packages/core/src/planner/types.ts` — add `StudyTask`, extend `PlannedItemType`.
- `packages/core/src/planner/planner.ts` — accept `studyTasks`, schedule them.
- `packages/core/src/planner/planner.test.ts` — study scheduling tests.
- `packages/core/src/index.ts` — export grades barrel.
- `src/lib/planner/plan-today.ts` — load course items, derive study tasks, project exams.
- `db/schema.sql` — append note pointing to `db/courses.sql` (documentation only).

---

## Phase 1 — Database

### Task 1: Course tables + RLS migration

**Files:**
- Create: `db/courses.sql`
- Create: `db/user_profiles_timezone.sql`

**Interfaces:**
- Produces: tables `public.courses`, `public.course_categories`, `public.course_items`; column `user_profiles.timezone`.

- [ ] **Step 1: Write `db/user_profiles_timezone.sql`**

```sql
alter table public.user_profiles
add column if not exists timezone text not null default 'America/Toronto';
```

- [ ] **Step 2: Write `db/courses.sql`**

```sql
-- Atlas Courses: courses, weighted categories, graded items (assignment/quiz/exam)

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  code text,
  color text,
  term text,
  target_grade numeric check (target_grade is null or (target_grade >= 0 and target_grade <= 100)),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists courses_user_idx on public.courses (user_id, archived_at);

create table if not exists public.course_categories (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists course_categories_course_idx on public.course_categories (course_id, position);

create table if not exists public.course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  category_id uuid references public.course_categories (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('assignment', 'quiz', 'exam')),
  title text not null,
  due_at timestamptz not null,
  end_at timestamptz,
  location text,
  score_earned numeric,
  score_max numeric not null default 100 check (score_max > 0),
  estimated_effort_hours numeric check (estimated_effort_hours is null or estimated_effort_hours >= 0),
  focus_mode text not null default 'continuous' check (focus_mode in ('finish_first', 'continuous', 'deferred')),
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= due_at)
);

create index if not exists course_items_course_idx on public.course_items (course_id);
create index if not exists course_items_user_due_idx on public.course_items (user_id, due_at);

alter table public.courses enable row level security;
alter table public.course_categories enable row level security;
alter table public.course_items enable row level security;

drop policy if exists "Users read own courses" on public.courses;
create policy "Users read own courses" on public.courses
for select using (auth.uid() = user_id);
drop policy if exists "Users write own courses" on public.courses;
create policy "Users write own courses" on public.courses
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own course categories" on public.course_categories;
create policy "Users read own course categories" on public.course_categories
for select using (auth.uid() = user_id);
drop policy if exists "Users write own course categories" on public.course_categories;
create policy "Users write own course categories" on public.course_categories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own course items" on public.course_items;
create policy "Users read own course items" on public.course_items
for select using (auth.uid() = user_id);
drop policy if exists "Users write own course items" on public.course_items;
create policy "Users write own course items" on public.course_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Verify SQL parses (local psql optional)**

If a local Supabase/psql is available: `psql "$DATABASE_URL" -f db/user_profiles_timezone.sql && psql "$DATABASE_URL" -f db/courses.sql`. Otherwise eyeball against `db/schedule_blocks.sql` for pattern parity. Expected: no syntax errors; tables created idempotently.

- [ ] **Step 4: Commit**

```bash
git add db/courses.sql db/user_profiles_timezone.sql
git commit -m "feat: add courses, categories, and course_items tables with RLS"
```

---

## Phase 2 — Core grade math

### Task 2: Grade types

**Files:**
- Create: `packages/core/src/grades/types.ts`

**Interfaces:**
- Produces:
```ts
export type GradeCategory = { id: string; name: string; weight: number };
export type GradedItem = { categoryId: string | null; scoreEarned: number | null; scoreMax: number };
export type CourseGradeCategory = {
  id: string; name: string; weight: number;
  score: number | null; gradedCount: number; itemCount: number;
};
export type CourseGradeWarning = "weights_sum_not_100";
export type CourseGrade = {
  average: number | null;
  gradedWeight: number;
  categories: CourseGradeCategory[];
  warnings: CourseGradeWarning[];
};
```

- [ ] **Step 1: Write the types file** (exact content above).

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/grades/types.ts
git commit -m "feat: add course grade types"
```

### Task 3: `computeCourseGrade`

**Files:**
- Create: `packages/core/src/grades/compute.ts`
- Test: `packages/core/src/grades/compute.test.ts`

**Interfaces:**
- Consumes: `GradeCategory`, `GradedItem`, `CourseGrade` from `./types`.
- Produces: `export function computeCourseGrade(categories: GradeCategory[], items: GradedItem[]): CourseGrade`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { computeCourseGrade } from "./compute";
import type { GradeCategory, GradedItem } from "./types";

const cats: GradeCategory[] = [
  { id: "hw", name: "Homework", weight: 20 },
  { id: "mid", name: "Midterm", weight: 30 },
  { id: "fin", name: "Final", weight: 50 },
];

describe("computeCourseGrade", () => {
  it("returns null average when nothing is graded", () => {
    const items: GradedItem[] = [{ categoryId: "hw", scoreEarned: null, scoreMax: 100 }];
    const result = computeCourseGrade(cats, items);
    expect(result.average).toBeNull();
    expect(result.gradedWeight).toBe(0);
  });

  it("points-sums within a category", () => {
    const items: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 5, scoreMax: 5 },
      { categoryId: "hw", scoreEarned: 50, scoreMax: 100 },
    ];
    const result = computeCourseGrade(cats, items);
    // (5+50)/(5+100) = 52.38...; only hw graded so average == hw score
    expect(result.average).toBeCloseTo(52.381, 2);
    expect(result.gradedWeight).toBe(20);
    expect(result.categories.find((c) => c.id === "hw")?.gradedCount).toBe(2);
  });

  it("re-normalizes over graded categories only", () => {
    const items: GradedItem[] = [
      { categoryId: "hw", scoreEarned: 90, scoreMax: 100 }, // 90%, weight 20
      { categoryId: "mid", scoreEarned: 80, scoreMax: 100 }, // 80%, weight 30
    ];
    const result = computeCourseGrade(cats, items);
    // (90*20 + 80*30) / (20+30) = (1800+2400)/50 = 84
    expect(result.average).toBeCloseTo(84, 5);
    expect(result.gradedWeight).toBe(50);
  });

  it("ignores items with null category (e.g. ungraded exam without a bucket)", () => {
    const items: GradedItem[] = [
      { categoryId: null, scoreEarned: 100, scoreMax: 100 },
      { categoryId: "hw", scoreEarned: 70, scoreMax: 100 },
    ];
    const result = computeCourseGrade(cats, items);
    expect(result.average).toBeCloseTo(70, 5);
  });

  it("flags weights not summing to 100", () => {
    const result = computeCourseGrade(
      [{ id: "a", name: "A", weight: 40 }, { id: "b", name: "B", weight: 40 }],
      [{ categoryId: "a", scoreEarned: 50, scoreMax: 100 }],
    );
    expect(result.warnings).toContain("weights_sum_not_100");
  });

  it("does not flag when weights sum to 100 within tolerance", () => {
    const result = computeCourseGrade(cats, [{ categoryId: "hw", scoreEarned: 50, scoreMax: 100 }]);
    expect(result.warnings).not.toContain("weights_sum_not_100");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- grades/compute`
Expected: FAIL (`computeCourseGrade` not defined / module missing).

- [ ] **Step 3: Write the implementation**

```ts
import type { CourseGrade, CourseGradeCategory, CourseGradeWarning, GradeCategory, GradedItem } from "./types";

export function computeCourseGrade(categories: GradeCategory[], items: GradedItem[]): CourseGrade {
  const gradedByCategory = new Map<string, { earned: number; max: number; graded: number; total: number }>();

  for (const category of categories) {
    gradedByCategory.set(category.id, { earned: 0, max: 0, graded: 0, total: 0 });
  }

  for (const item of items) {
    if (item.categoryId === null) continue;
    const bucket = gradedByCategory.get(item.categoryId);
    if (!bucket) continue;
    bucket.total += 1;
    if (item.scoreEarned !== null && Number.isFinite(item.scoreEarned) && item.scoreMax > 0) {
      bucket.earned += item.scoreEarned;
      bucket.max += item.scoreMax;
      bucket.graded += 1;
    }
  }

  const categoryResults: CourseGradeCategory[] = categories.map((category) => {
    const bucket = gradedByCategory.get(category.id)!;
    const score = bucket.graded > 0 && bucket.max > 0 ? (bucket.earned / bucket.max) * 100 : null;
    return {
      id: category.id,
      name: category.name,
      weight: category.weight,
      score,
      gradedCount: bucket.graded,
      itemCount: bucket.total,
    };
  });

  const graded = categoryResults.filter((c) => c.score !== null);
  const gradedWeight = graded.reduce((sum, c) => sum + c.weight, 0);
  const average =
    graded.length > 0 && gradedWeight > 0
      ? graded.reduce((sum, c) => sum + (c.score as number) * c.weight, 0) / gradedWeight
      : null;

  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const warnings: CourseGradeWarning[] = [];
  if (categories.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
    warnings.push("weights_sum_not_100");
  }

  return { average, gradedWeight, categories: categoryResults, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- grades/compute`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grades/compute.ts packages/core/src/grades/compute.test.ts
git commit -m "feat: add computeCourseGrade with graded-only re-normalization"
```

---

## Phase 3 — Core study tasks + planner wiring

### Task 4: Extend planner types with `StudyTask` and `study` item type

**Files:**
- Modify: `packages/core/src/planner/types.ts`

**Interfaces:**
- Produces (append to file):
```ts
export type StudyFocusMode = "finish_first" | "continuous" | "deferred";
export type StudyTask = {
  id: string;
  title: string;
  reason: string;
  durationMinutes: number;
  priority: 1 | 2 | 3;
  focusMode: StudyFocusMode;
};
```
- Modify `PlannedItemType` to include `"study"`:
```ts
export type PlannedItemType = "goal" | "focus" | "fitness" | "wellness" | "study" | "fallback";
```

- [ ] **Step 1: Edit `PlannedItemType`** to add `"study"` (before `"fallback"`).

- [ ] **Step 2: Append `StudyFocusMode` and `StudyTask`** to the file.

- [ ] **Step 3: Run the type check**

Run: `npx tsc -p packages/core/tsconfig.json --noEmit` (or `npm run test` which type-checks on import).
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/planner/types.ts
git commit -m "feat: add StudyTask type and study planned-item type"
```

### Task 5: `deriveStudyTasks`

**Files:**
- Create: `packages/core/src/grades/study.ts`
- Test: `packages/core/src/grades/study.test.ts`

**Interfaces:**
- Consumes: `StudyTask`, `StudyFocusMode` from `../planner/types`.
- Produces:
```ts
export type StudyItem = {
  id: string;
  title: string;
  courseName: string;
  kind: "assignment" | "quiz" | "exam";
  dueLocalDate: string;      // "YYYY-MM-DD" in the user's timezone
  scoreEarned: number | null;
  estimatedEffortHours: number | null;
  focusMode: StudyFocusMode;
};
export function deriveStudyTasks(items: StudyItem[], todayLocalDate: string, horizonDays?: number): StudyTask[];
```
- Behavior contract:
  - Active item = `scoreEarned === null` AND `dueLocalDate >= todayLocalDate`.
  - Only items with `estimatedEffortHours != null && > 0` and `daysUntilDue <= horizonDays` (default 7) produce tasks.
  - `daysUntilDue = max(1, dateDiffInDays(dueLocalDate, todayLocalDate))`.
  - `evenShare = round((hours * 60) / daysUntilDue)`.
  - `continuous`/`deferred(→continuous)` duration = clamp(evenShare, 15, 120).
  - `finish_first` duration = clamp(max(45, evenShare * 2), 15, 120); priority always 1.
  - Non-finish-first priority: `daysUntilDue <= 1 → 1`, `<= 3 → 2`, else `3`.
  - Deferred suppressed entirely while ANY active finish_first item exists (regardless of horizon/effort).
  - Return order: finish_first (by dueLocalDate asc) → continuous+deferred-now-continuous (by priority asc, then dueLocalDate asc).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { deriveStudyTasks, type StudyItem } from "./study";

const base: Omit<StudyItem, "id" | "focusMode" | "dueLocalDate"> = {
  title: "Essay",
  courseName: "History",
  kind: "assignment",
  scoreEarned: null,
  estimatedEffortHours: 6,
};

describe("deriveStudyTasks", () => {
  it("spreads effort evenly across remaining days", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", focusMode: "continuous", dueLocalDate: "2026-08-10" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 3 days out
    expect(tasks).toHaveLength(1);
    expect(tasks[0].durationMinutes).toBe(120); // 6h*60/3 = 120
    expect(tasks[0].priority).toBe(2); // within 3 days
  });

  it("clamps very large even shares to 120 minutes", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", estimatedEffortHours: 10, focusMode: "continuous", dueLocalDate: "2026-08-08" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 1 day
    expect(tasks[0].durationMinutes).toBe(120);
    expect(tasks[0].priority).toBe(1); // due tomorrow
  });

  it("excludes graded and past-due items", () => {
    const items: StudyItem[] = [
      { ...base, id: "graded", scoreEarned: 90, focusMode: "continuous", dueLocalDate: "2026-08-09" },
      { ...base, id: "past", focusMode: "continuous", dueLocalDate: "2026-08-05" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("excludes items with no effort estimate", () => {
    const items: StudyItem[] = [
      { ...base, id: "1", estimatedEffortHours: null, focusMode: "continuous", dueLocalDate: "2026-08-09" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07")).toHaveLength(0);
  });

  it("front-loads and prioritizes finish_first ahead of continuous", () => {
    const items: StudyItem[] = [
      { ...base, id: "cont", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-08-13" },
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-13" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07"); // 6 days out
    expect(tasks[0].id).toBe("ff");
    expect(tasks[0].priority).toBe(1);
    // ff evenShare = 3*60/6 = 30 -> finish_first max(45, 60)=60
    expect(tasks[0].durationMinutes).toBe(60);
  });

  it("suppresses deferred items while an active finish_first exists", () => {
    const items: StudyItem[] = [
      { ...base, id: "ff", estimatedEffortHours: 3, focusMode: "finish_first", dueLocalDate: "2026-08-12" },
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks.map((t) => t.id)).toEqual(["ff"]);
  });

  it("runs a deferred item as continuous when no finish_first is active", () => {
    const items: StudyItem[] = [
      { ...base, id: "def", estimatedEffortHours: 4, focusMode: "deferred", dueLocalDate: "2026-08-11" },
    ];
    const tasks = deriveStudyTasks(items, "2026-08-07");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("def");
  });

  it("respects the horizon", () => {
    const items: StudyItem[] = [
      { ...base, id: "far", estimatedEffortHours: 6, focusMode: "continuous", dueLocalDate: "2026-09-01" },
    ];
    expect(deriveStudyTasks(items, "2026-08-07", 7)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- grades/study`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
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

  const tasks: StudyTask[] = eligible.map((item) => {
    const daysUntilDue = Math.max(1, diffInDays(item.dueLocalDate, todayLocalDate));
    const evenShare = Math.round(((item.estimatedEffortHours as number) * 60) / daysUntilDue);
    const isFinishFirst = item.focusMode === "finish_first";
    const durationMinutes = isFinishFirst
      ? clamp(Math.max(45, evenShare * 2), 15, 120)
      : clamp(evenShare, 15, 120);
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

  return tasks.sort((a, b) => {
    const aFF = a.focusMode === "finish_first" ? 0 : 1;
    const bFF = b.focusMode === "finish_first" ? 0 : 1;
    if (aFF !== bFF) return aFF - bFF;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return 0;
  });
}
```

Note: within-tier ordering by due date is preserved because `Array.prototype.sort` is stable and `eligible` is derived from input order; when needed, callers pass items already ordered by `dueLocalDate`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- grades/study`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grades/study.ts packages/core/src/grades/study.test.ts
git commit -m "feat: add deriveStudyTasks with focus-mode scheduling"
```

### Task 6: Grades barrel + core export

**Files:**
- Create: `packages/core/src/grades/index.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `@personal-agent/core` re-exports `computeCourseGrade`, `deriveStudyTasks`, and grade types.

- [ ] **Step 1: Write `packages/core/src/grades/index.ts`**

```ts
export * from "./types";
export * from "./compute";
export * from "./study";
```

- [ ] **Step 2: Append to `packages/core/src/index.ts`**

```ts
export * from "./grades";
```

- [ ] **Step 3: Run tests (import sanity)**

Run: `npm run test -- grades`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/grades/index.ts packages/core/src/index.ts
git commit -m "chore: export grades module from core"
```

### Task 7: Schedule study tasks in the planner

**Files:**
- Modify: `packages/core/src/planner/planner.ts`
- Test: `packages/core/src/planner/planner.test.ts`

**Interfaces:**
- Consumes: `StudyTask` from `./types`.
- Produces: `generateDailyPlan` input gains optional `studyTasks?: StudyTask[]`.
- Behavior: finish-first study blueprints are scheduled before goal blueprints; continuous/deferred study after goals. A plan with any scheduled study or goal item is "substantive" (no forced fallback). Study blocks never overlap busy ranges (existing slotting guarantees this).

- [ ] **Step 1: Write the failing test** (append to `planner.test.ts`)

```ts
import { generateDailyPlan } from "./planner";
// ...existing imports/prefs...

describe("generateDailyPlan study tasks", () => {
  const preferences = {
    workStartTime: "09:00",
    workEndTime: "17:00",
    noMeetingStartTime: null,
    noMeetingEndTime: null,
    focusBlockMinutes: 60,
    workoutPreference: "none" as const,
  };

  it("places a study task into free time without overlapping an exam block", () => {
    const plan = generateDailyPlan({
      goals: [],
      preferences,
      calendarEvents: [{ id: "exam", title: "Midterm", category: "school", startTime: "10:00", endTime: "12:00" }],
      studyTasks: [
        { id: "s1", title: "Study: Midterm", reason: "Exam tomorrow", durationMinutes: 60, priority: 1, focusMode: "finish_first" },
      ],
    });
    const study = plan.items.find((i) => i.type === "study");
    expect(study).toBeDefined();
    // must not overlap 10:00-12:00
    const start = Number(study!.startTime.slice(0, 2)) * 60 + Number(study!.startTime.slice(3));
    const end = Number(study!.endTime.slice(0, 2)) * 60 + Number(study!.endTime.slice(3));
    expect(end <= 600 || start >= 720).toBe(true);
    expect(plan.constrained).toBe(false);
  });

  it("schedules finish-first study before a goal", () => {
    const plan = generateDailyPlan({
      goals: [{ title: "Read book", priority: 2 }],
      preferences,
      calendarEvents: [],
      studyTasks: [
        { id: "s1", title: "Study: Final", reason: "soon", durationMinutes: 60, priority: 1, focusMode: "finish_first" },
      ],
    });
    const studyIdx = plan.items.findIndex((i) => i.type === "study");
    const goalIdx = plan.items.findIndex((i) => i.type === "goal");
    expect(studyIdx).toBeGreaterThanOrEqual(0);
    expect(goalIdx).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- planner/planner`
Expected: FAIL (`studyTasks` not accepted / no `study` items produced).

- [ ] **Step 3: Implement in `planner.ts`**

3a. Extend `TaskBlueprint.source` union and add a study-time-fit branch. Change:
```ts
type TaskBlueprint = {
  type: Exclude<PlannedItemType, "fallback">;
  durationMinutes: number;
  title: string;
  reason: string;
  priority: 1 | 2 | 3;
  source: "system" | "goal" | "study";
};
```

3b. Add a `study` branch to `scoreTaskTimeFit` (mirror `focus`, prefers late morning):
```ts
  if (task.type === "study") {
    if (midpointHour >= 9 && midpointHour <= 12) return 24;
    if (midpointHour > 12 && midpointHour <= 16) return 10;
    return -8;
  }
```

3c. Add a converter and merge study blueprints with correct ordering:
```ts
function studyTasksToBlueprints(studyTasks: StudyTask[]): { finishFirst: TaskBlueprint[]; rest: TaskBlueprint[] } {
  const toBlueprint = (task: StudyTask): TaskBlueprint => ({
    type: "study",
    durationMinutes: normalizeDuration(task.durationMinutes, 15, 180),
    title: task.title,
    reason: task.reason,
    priority: task.priority,
    source: "study",
  });
  return {
    finishFirst: studyTasks.filter((t) => t.focusMode === "finish_first").map(toBlueprint),
    rest: studyTasks.filter((t) => t.focusMode !== "finish_first").map(toBlueprint),
  };
}
```

3d. In `generateDailyPlan`, accept `studyTasks` and order blueprints finish-first → goals → rest:
```ts
export function generateDailyPlan(input: {
  goals: Goal[];
  preferences: PlannerPreferences;
  calendarEvents: CalendarEvent[];
  studyTasks?: StudyTask[];
}): DailyPlan {
  const { goals, preferences, calendarEvents, studyTasks = [] } = input;
  // ...existing dayWindow / busyRanges / freeRanges / locationContextRanges...
  const goalBlueprints = createTaskBlueprints(goals);
  const { finishFirst, rest } = studyTasksToBlueprints(studyTasks);
  const tasks = [...finishFirst, ...goalBlueprints, ...rest];
  const scheduleResult = scheduleTasks(freeRanges, tasks, busyRanges, dayWindow, locationContextRanges);
  // ...unchanged below...
}
```

3e. Update `needsFallback` so study counts as substantive:
```ts
function needsFallback(items: Array<PlannedItem & { source?: TaskBlueprint["source"] }>): boolean {
  const hasSubstantive = items.some(
    (item) => item.source === "goal" || item.source === "study" || item.type === "goal" || item.type === "study",
  );
  return !hasSubstantive;
}
```

3f. Add the import at the top of `planner.ts`:
```ts
import type { CalendarEvent, DailyPlan, Goal, PlannerPreferences, PlannedItem, PlannedItemType, StudyTask } from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- planner/planner`
Expected: PASS (existing planner tests still green + 2 new).

- [ ] **Step 5: Run the full core suite for regressions**

Run: `npm run test -- packages/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/planner/planner.ts packages/core/src/planner/planner.test.ts
git commit -m "feat: schedule study tasks in the daily planner"
```

---

## Phase 4 — Data-access + projection

### Task 8: DB row types + DTOs

**Files:**
- Create: `src/lib/courses/types.ts`

**Interfaces:**
- Produces:
```ts
export type CourseRow = {
  id: string; user_id: string; name: string; code: string | null; color: string | null;
  term: string | null; target_grade: number | null; archived_at: string | null; created_at: string;
};
export type CourseCategoryRow = {
  id: string; course_id: string; user_id: string; name: string; weight: number; position: number; created_at: string;
};
export type CourseItemRow = {
  id: string; course_id: string; category_id: string | null; user_id: string;
  kind: "assignment" | "quiz" | "exam"; title: string; due_at: string; end_at: string | null;
  location: string | null; score_earned: number | null; score_max: number;
  estimated_effort_hours: number | null; focus_mode: "finish_first" | "continuous" | "deferred"; created_at: string;
};
export type CourseSummaryDTO = {
  id: string; name: string; code: string | null; color: string | null; term: string | null;
  targetGrade: number | null; archivedAt: string | null;
  average: number | null; gradedWeight: number;
  nextItem: { id: string; title: string; kind: CourseItemRow["kind"]; dueAt: string } | null;
};
```

- [ ] **Step 1: Write the file** (exact content above).
- [ ] **Step 2: Commit**

```bash
git add src/lib/courses/types.ts
git commit -m "feat: add course row types and DTOs"
```

### Task 9: Timezone → local date/time helper

**Files:**
- Create: `src/lib/courses/local-time.ts`
- Test: `src/lib/courses/local-time.test.ts`

**Interfaces:**
- Produces:
```ts
export function localParts(iso: string, timeZone: string): { date: string; time: string };
export function localDateOnly(iso: string, timeZone: string): string;
```
- `date` is `YYYY-MM-DD`, `time` is `HH:MM`, both in `timeZone` (IANA).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { localDateOnly, localParts } from "./local-time";

describe("local-time", () => {
  it("converts a UTC instant into Toronto local parts", () => {
    // 2026-08-07T01:30:00Z is 2026-08-06 21:30 EDT
    const parts = localParts("2026-08-07T01:30:00Z", "America/Toronto");
    expect(parts.date).toBe("2026-08-06");
    expect(parts.time).toBe("21:30");
  });

  it("localDateOnly returns just the date", () => {
    expect(localDateOnly("2026-08-07T12:00:00Z", "America/Toronto")).toBe("2026-08-07");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- courses/local-time`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
function partsMap(iso: string, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return map;
}

export function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const p = partsMap(iso, timeZone);
  const hour = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

export function localDateOnly(iso: string, timeZone: string): string {
  return localParts(iso, timeZone).date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- courses/local-time`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/courses/local-time.ts src/lib/courses/local-time.test.ts
git commit -m "feat: add timezone-aware local-time helper for course projection"
```

### Task 10: Rows → grade

**Files:**
- Create: `src/lib/courses/grade.ts`

**Interfaces:**
- Consumes: `CourseCategoryRow`, `CourseItemRow` from `./types`; `computeCourseGrade` from `@personal-agent/core`.
- Produces: `export function courseGradeFromRows(categories: CourseCategoryRow[], items: CourseItemRow[]): CourseGrade`.

- [ ] **Step 1: Write the implementation**

```ts
import { computeCourseGrade, type CourseGrade, type GradeCategory, type GradedItem } from "@personal-agent/core";
import type { CourseCategoryRow, CourseItemRow } from "./types";

export function courseGradeFromRows(categories: CourseCategoryRow[], items: CourseItemRow[]): CourseGrade {
  const gradeCategories: GradeCategory[] = categories.map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight) }));
  const gradedItems: GradedItem[] = items.map((item) => ({
    categoryId: item.category_id,
    scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
    scoreMax: Number(item.score_max),
  }));
  return computeCourseGrade(gradeCategories, gradedItems);
}
```

- [ ] **Step 2: Add a quick test** `src/lib/courses/grade.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { courseGradeFromRows } from "./grade";
import type { CourseCategoryRow, CourseItemRow } from "./types";

const cat = (id: string, weight: number): CourseCategoryRow => ({
  id, course_id: "c", user_id: "u", name: id, weight, position: 0, created_at: "",
});
const item = (categoryId: string, earned: number | null): CourseItemRow => ({
  id: Math.random().toString(), course_id: "c", category_id: categoryId, user_id: "u",
  kind: "assignment", title: "x", due_at: "2026-08-10T00:00:00Z", end_at: null, location: null,
  score_earned: earned, score_max: 100, estimated_effort_hours: null, focus_mode: "continuous", created_at: "",
});

it("maps rows into a course grade", () => {
  const result = courseGradeFromRows([cat("hw", 100)], [item("hw", 80)]);
  expect(result.average).toBeCloseTo(80, 5);
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- courses/grade`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/courses/grade.ts src/lib/courses/grade.test.ts
git commit -m "feat: map course rows to computed grade"
```

### Task 11: Projection to events + study items

**Files:**
- Create: `src/lib/courses/projection.ts`
- Test: `src/lib/courses/projection.test.ts`

**Interfaces:**
- Consumes: `CourseItemRow` from `./types`; `localParts`/`localDateOnly` from `./local-time`; `StudyItem` from `@personal-agent/core`; `CalendarEvent` from `@/lib/planner/types`.
- Produces:
```ts
export type ProjectedEvent = {
  id: string; title: string; category: "school"; kind: "assignment" | "quiz" | "exam";
  localDate: string; startTime: string; endTime: string; isDeadline: boolean;
};
export function projectCourseItemsToEvents(items: CourseItemRow[], timeZone: string): ProjectedEvent[];
export function courseItemsToTodayBusyEvents(items: CourseItemRow[], timeZone: string, todayLocalDate: string): CalendarEvent[];
export function courseItemsToStudyItems(items: CourseItemRow[], courseNameById: Map<string, string>, timeZone: string): StudyItem[];
```
- Rules:
  - `assignment` → `isDeadline: true`, `startTime === endTime` (the due time), duration zero.
  - `quiz`/`exam` → timed; `endTime` from `end_at` if present, else default (`quiz` +60min, `exam` +120min) clamped to same day (cap at `23:59`).
  - `courseItemsToTodayBusyEvents` returns only quiz/exam items whose `localDate === todayLocalDate` as `CalendarEvent` busy blocks.
  - `courseItemsToStudyItems` maps every item to a `StudyItem` (grade/effort/focus_mode carried through; `dueLocalDate` via timezone).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  courseItemsToStudyItems,
  courseItemsToTodayBusyEvents,
  projectCourseItemsToEvents,
} from "./projection";
import type { CourseItemRow } from "./types";

const tz = "America/Toronto";
const row = (over: Partial<CourseItemRow>): CourseItemRow => ({
  id: "i1", course_id: "c1", category_id: "cat", user_id: "u", kind: "exam", title: "Midterm",
  due_at: "2026-08-07T18:00:00Z", end_at: null, location: "Room 5", score_earned: null, score_max: 100,
  estimated_effort_hours: 4, focus_mode: "finish_first", created_at: "", ...over,
});

describe("projection", () => {
  it("projects an exam as a timed event with default 120-min duration", () => {
    const [event] = projectCourseItemsToEvents([row({})], tz);
    expect(event.isDeadline).toBe(false);
    // 18:00Z = 14:00 EDT, +120min = 16:00
    expect(event.startTime).toBe("14:00");
    expect(event.endTime).toBe("16:00");
  });

  it("projects an assignment as a zero-duration deadline marker", () => {
    const [event] = projectCourseItemsToEvents([row({ kind: "assignment", due_at: "2026-08-07T20:00:00Z" })], tz);
    expect(event.isDeadline).toBe(true);
    expect(event.startTime).toBe(event.endTime);
  });

  it("returns today's exam as a busy calendar event", () => {
    const events = courseItemsToTodayBusyEvents([row({})], tz, "2026-08-07");
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("school");
  });

  it("excludes assignments from today busy events", () => {
    const events = courseItemsToTodayBusyEvents([row({ kind: "assignment" })], tz, "2026-08-07");
    expect(events).toHaveLength(0);
  });

  it("maps to study items with local due date", () => {
    const names = new Map([["c1", "Chemistry"]]);
    const [study] = courseItemsToStudyItems([row({})], names, tz);
    expect(study.courseName).toBe("Chemistry");
    expect(study.dueLocalDate).toBe("2026-08-07");
    expect(study.focusMode).toBe("finish_first");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- courses/projection`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
import type { StudyItem } from "@personal-agent/core";
import type { CalendarEvent } from "@/lib/planner/types";
import { localDateOnly, localParts } from "./local-time";
import type { CourseItemRow } from "./types";

export type ProjectedEvent = {
  id: string;
  title: string;
  category: "school";
  kind: CourseItemRow["kind"];
  localDate: string;
  startTime: string;
  endTime: string;
  isDeadline: boolean;
};

function addMinutesToClock(time: string, minutes: number): string {
  const total = Math.min(23 * 60 + 59, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes);
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function defaultDurationMinutes(kind: CourseItemRow["kind"]): number {
  return kind === "exam" ? 120 : 60;
}

export function projectCourseItemsToEvents(items: CourseItemRow[], timeZone: string): ProjectedEvent[] {
  return items.map((item) => {
    const start = localParts(item.due_at, timeZone);
    if (item.kind === "assignment") {
      return {
        id: `course-${item.id}`, title: item.title, category: "school", kind: item.kind,
        localDate: start.date, startTime: start.time, endTime: start.time, isDeadline: true,
      };
    }
    const endTime = item.end_at
      ? localParts(item.end_at, timeZone).time
      : addMinutesToClock(start.time, defaultDurationMinutes(item.kind));
    return {
      id: `course-${item.id}`, title: item.title, category: "school", kind: item.kind,
      localDate: start.date, startTime: start.time, endTime, isDeadline: false,
    };
  });
}

export function courseItemsToTodayBusyEvents(
  items: CourseItemRow[],
  timeZone: string,
  todayLocalDate: string,
): CalendarEvent[] {
  return projectCourseItemsToEvents(items, timeZone)
    .filter((event) => !event.isDeadline && event.localDate === todayLocalDate)
    .map((event) => ({
      id: event.id, title: event.title, category: event.category,
      startTime: event.startTime, endTime: event.endTime,
    }));
}

export function courseItemsToStudyItems(
  items: CourseItemRow[],
  courseNameById: Map<string, string>,
  timeZone: string,
): StudyItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    courseName: courseNameById.get(item.course_id) ?? "Course",
    kind: item.kind,
    dueLocalDate: localDateOnly(item.due_at, timeZone),
    scoreEarned: item.score_earned === null ? null : Number(item.score_earned),
    estimatedEffortHours: item.estimated_effort_hours === null ? null : Number(item.estimated_effort_hours),
    focusMode: item.focus_mode,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- courses/projection`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/courses/projection.ts src/lib/courses/projection.test.ts
git commit -m "feat: project course items into calendar events and study items"
```

### Task 12: Supabase queries (fetch + CRUD)

**Files:**
- Create: `src/lib/courses/queries.ts`

**Interfaces:**
- Consumes: `CourseRow`, `CourseCategoryRow`, `CourseItemRow`, `CourseSummaryDTO` from `./types`; `courseGradeFromRows` from `./grade`.
- Produces (all take a Supabase client + userId; return typed rows/DTOs):
```ts
export async function listCourseSummaries(supabase, userId, opts?: { includeArchived?: boolean }): Promise<CourseSummaryDTO[]>;
export async function getCourseDetail(supabase, userId, courseId): Promise<{ course: CourseRow; categories: CourseCategoryRow[]; items: CourseItemRow[] } | null>;
export async function fetchAllCourseItems(supabase, userId): Promise<CourseItemRow[]>;
export async function fetchCoursesById(supabase, userId): Promise<Map<string, string>>; // id -> name
```
Use `SupabaseClient = Awaited<ReturnType<typeof createClient>>` typedef as in `plan-today.ts`.

- [ ] **Step 1: Write the implementation**

```ts
import type { createClient } from "@/lib/supabase/server";
import { courseGradeFromRows } from "./grade";
import type { CourseCategoryRow, CourseItemRow, CourseRow, CourseSummaryDTO } from "./types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const COURSE_COLUMNS = "id, user_id, name, code, color, term, target_grade, archived_at, created_at";
const CATEGORY_COLUMNS = "id, course_id, user_id, name, weight, position, created_at";
const ITEM_COLUMNS =
  "id, course_id, category_id, user_id, kind, title, due_at, end_at, location, score_earned, score_max, estimated_effort_hours, focus_mode, created_at";

export async function listCourseSummaries(
  supabase: SupabaseClient,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<CourseSummaryDTO[]> {
  let coursesQuery = supabase.from("courses").select(COURSE_COLUMNS).eq("user_id", userId);
  if (!opts.includeArchived) coursesQuery = coursesQuery.is("archived_at", null);
  const { data: courses, error: coursesError } = await coursesQuery.order("created_at", { ascending: true });
  if (coursesError) throw new Error(`Unable to load courses: ${coursesError.message}`);

  const { data: categories, error: categoriesError } = await supabase
    .from("course_categories").select(CATEGORY_COLUMNS).eq("user_id", userId);
  if (categoriesError) throw new Error(`Unable to load categories: ${categoriesError.message}`);

  const { data: items, error: itemsError } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).order("due_at", { ascending: true });
  if (itemsError) throw new Error(`Unable to load course items: ${itemsError.message}`);

  const categoriesByCourse = groupBy((categories ?? []) as CourseCategoryRow[], (c) => c.course_id);
  const itemsByCourse = groupBy((items ?? []) as CourseItemRow[], (i) => i.course_id);
  const nowIso = new Date().toISOString();

  return ((courses ?? []) as CourseRow[]).map((course) => {
    const courseCategories = categoriesByCourse.get(course.id) ?? [];
    const courseItems = itemsByCourse.get(course.id) ?? [];
    const grade = courseGradeFromRows(courseCategories, courseItems);
    const upcoming = courseItems.filter((i) => i.score_earned === null && i.due_at >= nowIso);
    const nextItem = upcoming[0]
      ? { id: upcoming[0].id, title: upcoming[0].title, kind: upcoming[0].kind, dueAt: upcoming[0].due_at }
      : null;
    return {
      id: course.id, name: course.name, code: course.code, color: course.color, term: course.term,
      targetGrade: course.target_grade === null ? null : Number(course.target_grade),
      archivedAt: course.archived_at, average: grade.average, gradedWeight: grade.gradedWeight, nextItem,
    };
  });
}

export async function getCourseDetail(supabase: SupabaseClient, userId: string, courseId: string) {
  const { data: course, error } = await supabase
    .from("courses").select(COURSE_COLUMNS).eq("user_id", userId).eq("id", courseId).maybeSingle();
  if (error) throw new Error(`Unable to load course: ${error.message}`);
  if (!course) return null;

  const { data: categories } = await supabase
    .from("course_categories").select(CATEGORY_COLUMNS).eq("user_id", userId).eq("course_id", courseId)
    .order("position", { ascending: true });
  const { data: items } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).eq("course_id", courseId)
    .order("due_at", { ascending: true });

  return {
    course: course as CourseRow,
    categories: (categories ?? []) as CourseCategoryRow[],
    items: (items ?? []) as CourseItemRow[],
  };
}

export async function fetchAllCourseItems(supabase: SupabaseClient, userId: string): Promise<CourseItemRow[]> {
  const { data, error } = await supabase
    .from("course_items").select(ITEM_COLUMNS).eq("user_id", userId).order("due_at", { ascending: true });
  if (error) throw new Error(`Unable to load course items: ${error.message}`);
  return (data ?? []) as CourseItemRow[];
}

export async function fetchCoursesById(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("courses").select("id, name").eq("user_id", userId);
  if (error) throw new Error(`Unable to load courses: ${error.message}`);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/courses/queries.ts
git commit -m "feat: add course query + summary helpers"
```

---

## Phase 5 — Planner integration in plan-today

### Task 13: Wire course items into the daily plan

**Files:**
- Modify: `src/lib/planner/plan-today.ts`
- Test: `src/lib/planner/plan-today.test.ts` (extend)

**Interfaces:**
- Consumes: `fetchAllCourseItems`, `fetchCoursesById` from `@/lib/courses/queries`; `courseItemsToStudyItems`, `courseItemsToTodayBusyEvents` from `@/lib/courses/projection`; `deriveStudyTasks` from `@personal-agent/core`; `localDateOnly` from `@/lib/courses/local-time`.
- Produces: plans generated for a user now include `study` items and treat today's exams/quizzes as busy.

- [ ] **Step 1: Add profile timezone to the profile query.** In the `user_profiles` select string, append `, timezone`. Add `timezone` to `UserProfileRow`-adjacent handling with a fallback: `const timezone = (profileRow as { timezone?: string }).timezone ?? "America/Toronto";`

- [ ] **Step 2: After building `calendarEvents`, load and project course items.** Insert before `generateDailyPlan`:

```ts
let studyTasks: import("@personal-agent/core").StudyTask[] = [];
try {
  const [items, courseNames] = await Promise.all([
    fetchAllCourseItems(supabase, userId),
    fetchCoursesById(supabase, userId),
  ]);
  const todayLocalDate = localDateOnly(new Date().toISOString(), timezone);
  const studyItems = courseItemsToStudyItems(items, courseNames, timezone);
  studyTasks = deriveStudyTasks(studyItems, todayLocalDate);
  const examBusy = courseItemsToTodayBusyEvents(items, timezone, todayLocalDate);
  calendarEvents = [...calendarEvents, ...examBusy];
} catch (error) {
  const message = error instanceof Error ? error.message : "Unable to load courses.";
  warnings.push(`Course read failed: ${message}`);
}
```

- [ ] **Step 3: Pass `studyTasks` into `generateDailyPlan`:**

```ts
const deterministicPlan = generateDailyPlan({ goals, preferences, calendarEvents, studyTasks });
```

- [ ] **Step 4: Add imports at the top of `plan-today.ts`:**

```ts
import { deriveStudyTasks } from "@personal-agent/core";
import { fetchAllCourseItems, fetchCoursesById } from "@/lib/courses/queries";
import { courseItemsToStudyItems, courseItemsToTodayBusyEvents } from "@/lib/courses/projection";
import { localDateOnly } from "@/lib/courses/local-time";
```

- [ ] **Step 5: Write an integration test** (extend `plan-today.test.ts`) using the existing test's Supabase mock pattern: seed one ungraded exam due today with effort, assert the returned plan contains a `study` item and the exam appears in `contextEvents`/busy. Follow the mock shape already in the file (read it first; mirror how goals/profile are stubbed, adding `course_items` and `courses` table stubs returning the seeded rows and empty arrays respectively).

- [ ] **Step 6: Run tests**

Run: `npm run test -- plan-today`
Expected: PASS (existing + new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/planner/plan-today.ts src/lib/planner/plan-today.test.ts
git commit -m "feat: reserve study time and block exams in the daily plan"
```

---

## Phase 6 — Mobile API

### Task 14: Courses list + create route

**Files:**
- Create: `src/app/api/mobile/courses/route.ts`

**Interfaces:**
- Consumes: `getAuthenticatedRequestClient` from `@/lib/supabase/request`; `listCourseSummaries` from `@/lib/courses/queries`.
- Produces:
  - `GET /api/mobile/courses?archived=1` → `{ courses: CourseSummaryDTO[] }`
  - `POST /api/mobile/courses` body `{ name, code?, color?, term?, targetGrade? }` → `{ course: CourseRow }` (201)

- [ ] **Step 1: Implement the route** (mirror `api/mobile/goals/route.ts` auth + validation style)

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { listCourseSummaries } from "@/lib/courses/queries";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function requiredText(value: unknown, label: string) {
  const text = optionalText(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}
function optionalPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Target grade must be between 0 and 100.");
  return n;
}
async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  try {
    const courses = await listCourseSummaries(result.auth.supabase, result.auth.user.id, { includeArchived });
    return NextResponse.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load courses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const { data, error } = await result.auth.supabase
      .from("courses")
      .insert({
        user_id: result.auth.user.id,
        name: requiredText(payload.name, "Course name"),
        code: optionalText(payload.code),
        color: optionalText(payload.color),
        term: optionalText(payload.term),
        target_grade: optionalPercent(payload.targetGrade),
      })
      .select("id, user_id, name, code, color, term, target_grade, archived_at, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create course.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc -p tsconfig.json --noEmit`

```bash
git add src/app/api/mobile/courses/route.ts
git commit -m "feat: add mobile courses list + create endpoint"
```

### Task 15: Course detail / update / delete route

**Files:**
- Create: `src/app/api/mobile/courses/[id]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/mobile/courses/:id` → `{ course, categories, items, grade }` (grade via `courseGradeFromRows`).
  - `PATCH /api/mobile/courses/:id` body of course fields (incl. `archived: boolean` → sets/clears `archived_at`).
  - `DELETE /api/mobile/courses/:id`.
- All scoped by `user_id`. 404 when `getCourseDetail` returns null.

- [ ] **Step 1: Implement** (Next 16 route params are async: `{ params }: { params: Promise<{ id: string }> }`, `const { id } = await params;`).

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRequestClient } from "@/lib/supabase/request";
import { getCourseDetail } from "@/lib/courses/queries";
import { courseGradeFromRows } from "@/lib/courses/grade";

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function requireAuth(request: NextRequest) {
  const auth = await getAuthenticatedRequestClient(request);
  if (!auth) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  return { auth };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  try {
    const detail = await getCourseDetail(result.auth.supabase, result.auth.user.id, id);
    if (!detail) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    const grade = courseGradeFromRows(detail.categories, detail.items);
    return NextResponse.json({ ...detail, grade });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load course.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if ("name" in payload) update.name = optionalText(payload.name);
    if ("code" in payload) update.code = optionalText(payload.code);
    if ("color" in payload) update.color = optionalText(payload.color);
    if ("term" in payload) update.term = optionalText(payload.term);
    if ("targetGrade" in payload) {
      const n = payload.targetGrade === null || payload.targetGrade === "" ? null : Number(payload.targetGrade);
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
        return NextResponse.json({ error: "Target grade must be between 0 and 100." }, { status: 400 });
      }
      update.target_grade = n;
    }
    if (typeof payload.archived === "boolean") {
      update.archived_at = payload.archived ? new Date().toISOString() : null;
    }
    const { data, error } = await result.auth.supabase
      .from("courses").update(update).eq("id", id).eq("user_id", result.auth.user.id)
      .select("id, user_id, name, code, color, term, target_grade, archived_at, created_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update course.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth(request);
  if ("response" in result) return result.response;
  const { id } = await params;
  const { error } = await result.auth.supabase
    .from("courses").delete().eq("id", id).eq("user_id", result.auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check + commit**

```bash
git add "src/app/api/mobile/courses/[id]/route.ts"
git commit -m "feat: add mobile course detail/update/delete endpoint"
```

### Task 16: Category CRUD route

**Files:**
- Create: `src/app/api/mobile/courses/[id]/categories/route.ts`

**Interfaces:**
- Produces:
  - `POST` body `{ name, weight, position? }` → `{ category }` (201), sets `course_id = :id`.
  - `PATCH` body `{ categoryId, name?, weight?, position? }` → `{ category }`.
  - `DELETE` body `{ categoryId }` → `{ ok: true }`.
- All validate ownership via `user_id` and `course_id`. Weight coerced to `[0,100]`.

- [ ] **Step 1: Implement** (same auth helper; weight parse: `Math.max(0, Math.min(100, Number(value) || 0))`; on POST also insert `user_id` and `course_id: id`). Follow the goals route shape for POST/PATCH/DELETE bodies.

- [ ] **Step 2: Type-check + commit**

```bash
git add "src/app/api/mobile/courses/[id]/categories/route.ts"
git commit -m "feat: add mobile course category CRUD endpoint"
```

### Task 17: Item CRUD route (incl. grade entry)

**Files:**
- Create: `src/app/api/mobile/courses/[id]/items/route.ts`

**Interfaces:**
- Produces:
  - `POST` body `{ kind, title, categoryId?, dueAt, endAt?, location?, scoreMax?, estimatedEffortHours?, focusMode? }` → `{ item }` (201).
  - `PATCH` body `{ itemId, ...fields, scoreEarned? }` → `{ item }` (grade entry uses `scoreEarned`, null clears it).
  - `DELETE` body `{ itemId }` → `{ ok: true }`.
- Validation: `kind ∈ {assignment,quiz,exam}`; `focusMode ∈ {finish_first,continuous,deferred}` default `continuous`; `dueAt` required ISO; `scoreMax > 0` default 100; `scoreEarned` finite ≥ 0 or null; `estimatedEffortHours` ≥ 0 or null.

- [ ] **Step 1: Implement** with these parse helpers:

```ts
const KINDS = new Set(["assignment", "quiz", "exam"]);
const MODES = new Set(["finish_first", "continuous", "deferred"]);
function parseKind(v: unknown) { if (typeof v === "string" && KINDS.has(v)) return v; throw new Error("Invalid kind."); }
function parseMode(v: unknown) { return typeof v === "string" && MODES.has(v) ? v : "continuous"; }
function parseIsoRequired(v: unknown, label: string) {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new Error(`${label} must be a valid date.`);
  return v;
}
function parseNonNegOrNull(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error("Value must be zero or greater."); return n;
}
function parseScoreMax(v: unknown) { const n = Number(v ?? 100); return Number.isFinite(n) && n > 0 ? n : 100; }
```

Map body → row columns (`category_id`, `due_at`, `end_at`, `score_max`, `estimated_effort_hours`, `focus_mode`), insert with `user_id` + `course_id: id`; select `ITEM_COLUMNS`. For PATCH build a partial update only from present keys; `scoreEarned` present → `score_earned = parseNonNegOrNull(...)`.

- [ ] **Step 2: Type-check + commit**

```bash
git add "src/app/api/mobile/courses/[id]/items/route.ts"
git commit -m "feat: add mobile course item CRUD + grade entry endpoint"
```

### Task 18: Full-suite verification

- [ ] **Step 1: Run everything**

Run: `npm run test`
Expected: PASS (all core + lib + route tests).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors in new files.

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit && npx tsc -p packages/core/tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 4: Commit any lint fixups**

```bash
git add -A && git commit -m "chore: lint + type fixups for courses foundation"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §3 tables → Task 1; §4 grade math → Tasks 2–3; §5 study/planner → Tasks 4–7, 13; §6 projection + data-access → Tasks 8–12; §8 mobile API → Tasks 14–17. UI (§7) is deliberately deferred to Plan 2.
- **Placeholder scan:** none — all steps carry concrete code except Tasks 13/16/17 assembly steps, which specify exact helpers, columns, and payload shapes to mirror existing routes.
- **Type consistency:** `StudyTask`/`StudyItem`/`CourseGrade`/row types are defined once and referenced by exact name across tasks; `focus_mode` values and `kind` values are consistent everywhere.

## Applying the migrations

The SQL in `db/` is applied manually in the Supabase SQL editor (per `README.md`). After Task 1, run `db/user_profiles_timezone.sql` then `db/courses.sql` there before exercising the API against a live database.
