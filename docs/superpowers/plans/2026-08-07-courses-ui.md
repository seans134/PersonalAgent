# Courses & Grade Manager — UI Implementation Plan (Web + Mobile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Depends on:** `2026-08-07-courses-foundation.md` must be fully implemented first (tables, `src/lib/courses/*`, mobile API, core grade/study exports).

**Goal:** Build the web Courses pages/server-actions and the mobile Courses screens, plus surface the new `study` planned-item type in both plan renderers.

**Architecture:** Web pages are React Server Components under `src/app/courses/` calling server actions in `src/app/courses/actions.ts` (which reuse `src/lib/courses/*`). Mobile adds two screens + a modal under `mobile/components/`, wired through `mobile/lib/api.ts` to the Plan 1 endpoints. A shared bullet-chart visual is implemented per platform (SVG on web, `View` bars on mobile).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (tokens in `globals.css`), Expo React Native, `@personal-agent/core` theme tokens.

## Global Constraints

- Never hardcode a hex — use CSS variables (web) or `useTheme()` tokens (mobile) from the Atlas Cartographic system (`packages/core/src/theme`, `src/app/globals.css`, `mobile/lib/theme.ts`).
- Grade figures, averages, and times render in the **mono** token (`fonts.mono` / `--font-mono`).
- `compass` warm accent is reserved for the single most-imminent "next up" item only.
- Grade values are always shown as text; color (`danger`/`warning`/`success`) is decoration, never the sole signal.
- Forms: visible labels (never placeholder-only), validate on blur, show loading → success/error on submit.
- Motion 150–300ms; animate bullet fill via `transform: scaleX` (origin left); respect `prefers-reduced-motion`.
- Mobile touch: `Pressable` + `android_ripple`, `hitSlop` on small controls, 44×44 min, safe-area insets.
- Responsive breakpoints: 375 / 768 / 1024 / 1440. Web tables use `overflow-x-auto`; mobile uses card rows.
- Server actions: auth-check + validate inside, `revalidatePath` after (mirror `src/app/goals/actions.ts`).
- Commit after each task.

---

## File Structure

**Created (web):**
- `src/app/courses/actions.ts` — all course/category/item server actions.
- `src/app/courses/page.tsx` — course list (server component).
- `src/app/courses/course-card.tsx` — one summary card.
- `src/app/courses/new-course-form.tsx` — add-course form (client).
- `src/app/courses/[id]/page.tsx` — course detail (server component).
- `src/app/courses/[id]/grade-summary.tsx` — hero bullet + category grid (client, for fill animation).
- `src/app/courses/[id]/category-editor.tsx` — categories panel (client).
- `src/app/courses/[id]/item-row.tsx` — one item row with inline grade entry (client).
- `src/app/courses/[id]/item-form.tsx` — add/edit item form (client).
- `src/components/bullet-bar.tsx` — reusable SVG bullet chart.
- `src/components/grade-format.ts` — shared grade/zone formatting helpers.

**Created (mobile):**
- `mobile/components/CoursesScreen.tsx`
- `mobile/components/CourseDetailScreen.tsx`
- `mobile/components/CourseItemModal.tsx`
- `mobile/components/BulletBar.tsx`

**Modified (web):**
- `src/components/app-shell.tsx` — add "Courses" nav entry.
- `src/components/plan-item-card.tsx` — handle `study` type.
- `src/components/today-plan-meridian.tsx` — `study` node color (if it maps categories).

**Modified (mobile):**
- `mobile/lib/api.ts` — course types + fetch/CRUD functions.
- `mobile/components/MobileAppShell.tsx` — add `courses`/`courseDetail` to `MobileScreen` + `screenToTab`.
- `mobile/components/MoreMenuScreen.tsx` — add "Courses" row.
- `mobile/App.tsx` — route the two new screens.
- `mobile/components/TodayPlanTimeline.tsx` — `study` label/color.

---

## Phase 1 — Shared web visuals

### Task 1: Grade formatting helpers

**Files:**
- Create: `src/components/grade-format.ts`

**Interfaces:**
- Produces:
```ts
export function formatGrade(value: number | null): string;      // "84.0%" or "—"
export function gradeZone(value: number | null): "danger" | "warning" | "success" | "empty";
```
- Zones: `< 60 → danger`, `< 80 → warning`, `>= 80 → success`, `null → empty`.

- [ ] **Step 1: Write the failing test** `src/components/grade-format.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatGrade, gradeZone } from "./grade-format";

describe("grade-format", () => {
  it("formats a grade to one decimal with a percent", () => {
    expect(formatGrade(84)).toBe("84.0%");
  });
  it("shows an em dash for null", () => {
    expect(formatGrade(null)).toBe("—");
  });
  it("maps values to zones", () => {
    expect(gradeZone(50)).toBe("danger");
    expect(gradeZone(72)).toBe("warning");
    expect(gradeZone(91)).toBe("success");
    expect(gradeZone(null)).toBe("empty");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- grade-format`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function formatGrade(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function gradeZone(value: number | null): "danger" | "warning" | "success" | "empty" {
  if (value === null || !Number.isFinite(value)) return "empty";
  if (value < 60) return "danger";
  if (value < 80) return "warning";
  return "success";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- grade-format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/grade-format.ts src/components/grade-format.test.ts
git commit -m "feat: add grade formatting + zone helpers"
```

### Task 2: SVG bullet-bar component

**Files:**
- Create: `src/components/bullet-bar.tsx`

**Interfaces:**
- Consumes: `gradeZone` from `./grade-format`.
- Produces:
```tsx
export function BulletBar(props: {
  value: number | null;   // 0..100 or null
  target?: number | null; // target tick, 0..100
  height?: number;        // px, default 14
  ariaLabel: string;
}): JSX.Element;
```
- Renders a horizontal track (0–100) with danger/warning/success zone backgrounds (using `--color-danger/warning/success` at low alpha), a filled bar to `value` colored by `gradeZone`, and a vertical target tick. Fill uses `transform: scaleX(value/100)` with `transform-origin:left` and a 200ms transition, disabled under `prefers-reduced-motion`. Empty value → track only, no fill. Always `role="img"` with `aria-label`.

- [ ] **Step 1: Implement** (component-only; no test — visual). Use CSS variables for all colors. Example core structure:

```tsx
import { gradeZone } from "./grade-format";

const ZONE_VAR: Record<"danger" | "warning" | "success", string> = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
};

export function BulletBar({ value, target = null, height = 14, ariaLabel }: {
  value: number | null; target?: number | null; height?: number; ariaLabel: string;
}) {
  const zone = gradeZone(value);
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div role="img" aria-label={ariaLabel} className="bullet" style={{ height }}>
      <div className="bullet__zone bullet__zone--danger" />
      <div className="bullet__zone bullet__zone--warning" />
      <div className="bullet__zone bullet__zone--success" />
      {value !== null && (
        <div
          className="bullet__fill"
          style={{ transform: `scaleX(${pct / 100})`, background: ZONE_VAR[zone === "empty" ? "warning" : zone] }}
        />
      )}
      {target !== null && <div className="bullet__target" style={{ left: `${Math.max(0, Math.min(100, target))}%` }} />}
    </div>
  );
}
```

Add the matching styles to `src/app/globals.css` (zone widths 60/20/20%, `.bullet` position relative + rounded, `.bullet__fill` absolute inset-0 origin-left with `transition: transform 200ms ease`, wrapped in `@media (prefers-reduced-motion: reduce) { .bullet__fill { transition: none; } }`, `.bullet__target` a 2px `--color-ink` vertical line).

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc -p tsconfig.json --noEmit`

```bash
git add src/components/bullet-bar.tsx src/app/globals.css
git commit -m "feat: add SVG bullet-bar grade visual"
```

---

## Phase 2 — Web server actions

### Task 3: Course + category + item server actions

**Files:**
- Create: `src/app/courses/actions.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces server actions (all `"use server"`, auth-guard → `redirect("/auth")`, validate, mutate scoped by `user_id`, `revalidatePath`):
  - `createCourse(formData)`, `updateCourse(formData)`, `archiveCourse(formData)`, `deleteCourse(formData)`
  - `createCategory(formData)`, `updateCategory(formData)`, `deleteCategory(formData)`
  - `createItem(formData)`, `updateItem(formData)`, `setItemGrade(formData)`, `deleteItem(formData)`
- Redirect targets: course actions → `/courses`; category/item actions → `/courses/${courseId}`. On error: `redirect('/courses?error=...' | '/courses/${id}?error=...')`.

- [ ] **Step 1: Implement** following `src/app/goals/actions.ts` exactly for structure (the `createClient`, `auth.getUser`, `redirect` on missing user, `revalidatePath` pattern). Field parsing:
  - Course: `name` (required text), `code`/`term`/`color` (optional text), `target_grade` (optional 0–100 number).
  - Category: `course_id` (required), `name` (required), `weight` (0–100 number, default 0), `position` (int, default 0). For delete/update also `category_id`.
  - Item: `course_id` (required), `kind` (assignment|quiz|exam), `title` (required), `category_id` (optional), `due_at` (required ISO — the form sends a `datetime-local` value; convert to ISO with `new Date(value).toISOString()`), `end_at` (optional), `location` (optional), `score_max` (>0, default 100), `estimated_effort_hours` (optional ≥0), `focus_mode` (finish_first|continuous|deferred, default continuous).
  - `setItemGrade`: `item_id`, `course_id`, `score_earned` (empty → null clears grade, else finite ≥0).

Representative action (repeat the pattern for the rest):

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const KINDS = new Set(["assignment", "quiz", "exam"]);
const MODES = new Set(["finish_first", "continuous", "deferred"]);

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  return { supabase, user };
}

export async function createCourse(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/courses?error=Course%20name%20is%20required");
  const targetRaw = String(formData.get("target_grade") ?? "").trim();
  const target = targetRaw ? Number(targetRaw) : null;
  if (target !== null && (!Number.isFinite(target) || target < 0 || target > 100)) {
    redirect("/courses?error=Target%20grade%20must%20be%200-100");
  }
  const { error } = await supabase.from("courses").insert({
    user_id: user.id, name,
    code: String(formData.get("code") ?? "").trim() || null,
    term: String(formData.get("term") ?? "").trim() || null,
    color: String(formData.get("color") ?? "").trim() || null,
    target_grade: target,
  });
  if (error) redirect(`/courses?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/courses");
  redirect("/courses");
}

export async function setItemGrade(formData: FormData) {
  const { supabase, user } = await requireUser();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const courseId = String(formData.get("course_id") ?? "").trim();
  const raw = String(formData.get("score_earned") ?? "").trim();
  const score = raw === "" ? null : Number(raw);
  if (score !== null && (!Number.isFinite(score) || score < 0)) {
    redirect(`/courses/${courseId}?error=Grade%20must%20be%20zero%20or%20greater`);
  }
  const { error } = await supabase.from("course_items")
    .update({ score_earned: score }).eq("id", itemId).eq("user_id", user.id);
  if (error) redirect(`/courses/${courseId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect(`/courses/${courseId}`);
}
```

Include the remaining actions (`updateCourse`, `archiveCourse` sets `archived_at`, `deleteCourse`, `createCategory`/`updateCategory`/`deleteCategory`, `createItem`/`updateItem`/`deleteItem`) with the same guard/validate/revalidate shape. `createItem` converts `datetime-local` inputs to ISO.

- [ ] **Step 2: Type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/courses/actions.ts
git commit -m "feat: add courses server actions"
```

---

## Phase 3 — Web pages

### Task 4: Course list page + card + add form

**Files:**
- Create: `src/app/courses/page.tsx`, `src/app/courses/course-card.tsx`, `src/app/courses/new-course-form.tsx`
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `listCourseSummaries` from `@/lib/courses/queries`; `BulletBar`, `formatGrade` from components; `createCourse` from `./actions`.
- Produces: `/courses` route rendering active + archived courses.

- [ ] **Step 1: Implement `page.tsx`** — server component: get user (redirect to `/auth` if none), call `listCourseSummaries(supabase, user.id, { includeArchived: true })`, split active/archived. Render a responsive grid (`grid gap-4 sm:grid-cols-2 xl:grid-cols-3`) of `<CourseCard>`; archived in a collapsed `<details>`. Render `<NewCourseForm />`. Read `searchParams.error` and show an inline error banner (mirror how `src/app/goals/page.tsx` surfaces `error`).

- [ ] **Step 2: Implement `course-card.tsx`** — presentational. Shows `name` (display font), `code`/`term` (muted label), hero average via `formatGrade(average)` in mono + `<BulletBar value={average} target={targetGrade} ariaLabel=... />`, the `gradedWeight` caption ("Based on N% of your grade"), and the next item ("Next: Midterm · Aug 12" — style the chip with `compass` **only** when it is the nearest upcoming across all courses; otherwise neutral). Wrap the card in a link to `/courses/${id}`.

- [ ] **Step 3: Implement `new-course-form.tsx`** — `"use client"`, `<form action={createCourse}>` with labeled inputs: Name (required), Code, Term, Target grade (number, 0–100), Color (optional). Submit button shows a pending state via `useFormStatus`. Labels visible; inputs have `id`+`htmlFor`.

- [ ] **Step 4: Add nav entry** in `src/components/app-shell.tsx` — add a "Courses" link pointing to `/courses` next to the existing Goals/Calendar links (match the existing nav item markup exactly).

- [ ] **Step 5: Verify in the browser** (preview workflow)
  - `preview_start` the web dev server; navigate to `/courses`.
  - `read_console_messages` / `preview_logs` → no errors.
  - `read_page` → confirm the heading, add-course form labels, and (with seeded data) a course card with a mono average and bullet bar.
  - `resize_window` mobile (375) → cards stack single-column, no horizontal scroll.
  - Screenshot for the record.

- [ ] **Step 6: Commit**

```bash
git add src/app/courses/page.tsx src/app/courses/course-card.tsx src/app/courses/new-course-form.tsx src/components/app-shell.tsx
git commit -m "feat: add courses list page and navigation"
```

### Task 5: Course detail — grade summary panel

**Files:**
- Create: `src/app/courses/[id]/page.tsx`, `src/app/courses/[id]/grade-summary.tsx`

**Interfaces:**
- Consumes: `getCourseDetail` from `@/lib/courses/queries`; `courseGradeFromRows` from `@/lib/courses/grade`; `BulletBar`, `formatGrade`, `gradeZone` from components.
- Produces: `/courses/:id` route. `page.tsx` fetches detail (404 → `notFound()`), computes grade, and renders three panels; this task delivers the summary panel.

- [ ] **Step 1: Implement `page.tsx`** — server component. `const { id } = await params;` get user, `getCourseDetail`; if null `notFound()`. Compute `grade = courseGradeFromRows(categories, items)`. Layout: two-column on `lg` (`lg:grid-cols-[minmax(280px,360px)_1fr]`) with the grade summary in a `lg:sticky lg:top-4` aside, and the category editor + items list in the main column. Single column below `lg`. Pass data to the three child components.

- [ ] **Step 2: Implement `grade-summary.tsx`** — `"use client"` (for the fill animation on mount). Renders:
  - Hero: `formatGrade(grade.average)` in mono `--font-mono` at display size, `<BulletBar value={grade.average} target={course.target_grade} />`, caption "Based on {gradedWeight}% of your final grade".
  - If `grade.warnings` includes `weights_sum_not_100`: a `--color-warning` banner "Category weights sum to {sum}%, not 100%." (compute sum from categories).
  - Category breakdown grid: one row per `grade.categories` entry — name + `weight%` label, `<BulletBar value={score} ariaLabel />`, `formatGrade(score)` in mono, and "{gradedCount} of {itemCount} graded" muted. Ungraded categories show `—` and an empty bar.
  - The table container has `overflow-x-auto`.

- [ ] **Step 3: Verify in the browser**
  - Navigate to a seeded course's `/courses/:id`.
  - `read_page` → hero average, target tick present, category rows with graded counts.
  - Toggle `resize_window` desktop/mobile → two-column collapses to one; no horizontal overflow.
  - `javascript_tool`: check the computed `--font-mono` is applied to the average element.
  - Screenshot.

- [ ] **Step 4: Commit**

```bash
git add "src/app/courses/[id]/page.tsx" "src/app/courses/[id]/grade-summary.tsx"
git commit -m "feat: add course detail page with grade summary"
```

### Task 6: Course detail — category editor + item list/form

**Files:**
- Create: `src/app/courses/[id]/category-editor.tsx`, `src/app/courses/[id]/item-row.tsx`, `src/app/courses/[id]/item-form.tsx`

**Interfaces:**
- Consumes: actions from `../actions`; `formatGrade`, `gradeZone` from components.
- Produces: the categories panel and the items panel of the detail page.

- [ ] **Step 1: `category-editor.tsx`** — `"use client"`. Lists categories with inline edit (`<form action={updateCategory}>` per row: name text + weight number + hidden `category_id`/`course_id`, save button) and a delete button (`<form action={deleteCategory}>`). An "Add category" `<form action={createCategory}>` with Name + Weight. All labels visible.

- [ ] **Step 2: `item-row.tsx`** — `"use client"`. One row: kind badge (icon + label; assignment/quiz/exam — icon only, neutral chip), title, due/scheduled time (mono; for quiz/exam show time + location, for assignment show "Due {date}"), a scheduling-mode pill (Finish first / Ongoing / Do later mapped from `focus_mode`), and inline grade entry:

```tsx
<form action={setItemGrade} className="grade-entry">
  <input type="hidden" name="item_id" value={item.id} />
  <input type="hidden" name="course_id" value={item.course_id} />
  <label className="sr-only" htmlFor={`g-${item.id}`}>Grade earned for {item.title}</label>
  <input
    id={`g-${item.id}`}
    name="score_earned"
    type="number"
    inputMode="decimal"
    min={0}
    defaultValue={item.score_earned ?? ""}
    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
    className="font-mono"
  />
  <span className="font-mono">/ {item.score_max}</span>
</form>
```

Grade-entry submits on blur (validate-on-blur rule) and the server action re-renders with the new average. Edit/delete buttons open `item-form` / submit `deleteItem`.

- [ ] **Step 3: `item-form.tsx`** — `"use client"`. Add/edit form (`createItem`/`updateItem`). Fields: Kind (select), Title (required), Category (select of the course's categories, optional), Due/Scheduled datetime (`datetime-local`, required), and — shown only when kind is `quiz`/`exam` — End time (`datetime-local`) and Location; Score max (number, default 100); Estimated effort hours (number, optional); Scheduling mode (select: Finish first / Ongoing / Do later). Conditionally render the quiz/exam-only fields from the selected kind (progressive disclosure). `useFormStatus` pending state; success re-renders the list.

- [ ] **Step 4: Verify in the browser**
  - Add a category (weight 20), add an assignment with a grade → average updates; add a second category so weights = 100 → warning banner disappears.
  - Enter a grade via the inline field, blur → `read_network_requests`/`read_page` confirms the average recomputed.
  - Switch item kind to Exam in the form → Location/End fields appear.
  - Screenshot the populated detail page.

- [ ] **Step 5: Commit**

```bash
git add "src/app/courses/[id]/category-editor.tsx" "src/app/courses/[id]/item-row.tsx" "src/app/courses/[id]/item-form.tsx"
git commit -m "feat: add category editor and course item list/form"
```

### Task 7: Surface `study` items in the web plan renderer

**Files:**
- Modify: `src/components/plan-item-card.tsx`
- Modify: `src/components/today-plan-meridian.tsx` (only if it color-maps by category)

**Interfaces:**
- Produces: plan cards render `study`-type items with a "Study" label and a distinct token color.

- [ ] **Step 1: Read `plan-item-card.tsx`** to find how `type` maps to label/color (likely a record keyed by `PlannedItemType`). Add a `study` entry — label "Study", icon consistent with academics, color `var(--color-focus)` (blue, reads as academic; not `compass`). If `today-plan-meridian.tsx` maps a `PlanCategory`, map `study` → `focus` node color there.

- [ ] **Step 2: Verify in the browser**
  - With a seeded ungraded exam (effort set) due within the horizon, generate today's plan on `/`.
  - `read_page` → a "Study: …" card appears with the study styling and does not overlap the exam block.
  - Screenshot.

- [ ] **Step 3: Commit**

```bash
git add src/components/plan-item-card.tsx src/components/today-plan-meridian.tsx
git commit -m "feat: render study items in the daily plan"
```

---

## Phase 4 — Mobile

### Task 8: Mobile API client functions

**Files:**
- Modify: `mobile/lib/api.ts`

**Interfaces:**
- Consumes: existing `fetchJson` helper in the file.
- Produces (mirror the existing `fetchMobileGoals`/`createMobileGoal` shape):
```ts
export type MobileCourseSummary = {
  id: string; name: string; code: string | null; color: string | null; term: string | null;
  targetGrade: number | null; archivedAt: string | null;
  average: number | null; gradedWeight: number;
  nextItem: { id: string; title: string; kind: "assignment" | "quiz" | "exam"; dueAt: string } | null;
};
export type MobileCourseDetail = {
  course: { id: string; name: string; code: string | null; color: string | null; term: string | null; target_grade: number | null; archived_at: string | null };
  categories: Array<{ id: string; name: string; weight: number; position: number }>;
  items: Array<{ id: string; course_id: string; category_id: string | null; kind: "assignment" | "quiz" | "exam"; title: string; due_at: string; end_at: string | null; location: string | null; score_earned: number | null; score_max: number; estimated_effort_hours: number | null; focus_mode: "finish_first" | "continuous" | "deferred" }>;
  grade: { average: number | null; gradedWeight: number; warnings: string[]; categories: Array<{ id: string; name: string; weight: number; score: number | null; gradedCount: number; itemCount: number }> };
};
export async function fetchMobileCourses(accessToken: string, includeArchived?: boolean): Promise<{ courses: MobileCourseSummary[] }>;
export async function createMobileCourse(accessToken, input): Promise<{ course: MobileCourseDetail["course"] }>;
export async function fetchMobileCourseDetail(accessToken, id): Promise<MobileCourseDetail>;
export async function updateMobileCourse(accessToken, id, input): Promise<...>;
export async function deleteMobileCourse(accessToken, id): Promise<{ ok: true }>;
export async function saveMobileCategory(accessToken, courseId, input): Promise<...>;      // POST or PATCH by presence of categoryId
export async function deleteMobileCategory(accessToken, courseId, categoryId): Promise<...>;
export async function saveMobileItem(accessToken, courseId, input): Promise<...>;           // POST or PATCH by presence of itemId
export async function setMobileItemGrade(accessToken, courseId, itemId, scoreEarned: number | null): Promise<...>;
export async function deleteMobileItem(accessToken, courseId, itemId): Promise<...>;
```

- [ ] **Step 1: Implement** the types + functions using `fetchJson(path, accessToken, { method, body })` exactly as the goals functions do (read them at lines ~551–566 first). Endpoints: `/api/mobile/courses`, `/api/mobile/courses/${id}`, `/api/mobile/courses/${id}/categories`, `/api/mobile/courses/${id}/items`. Fire `captureEvent` for create/grade like the goals functions do (optional but consistent).

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/api.ts
git commit -m "feat: add mobile course API client functions"
```

### Task 9: Mobile bullet bar + navigation wiring

**Files:**
- Create: `mobile/components/BulletBar.tsx`
- Modify: `mobile/components/MobileAppShell.tsx`, `mobile/components/MoreMenuScreen.tsx`, `mobile/App.tsx`

**Interfaces:**
- Produces: `BulletBar` RN component (`View`-based zones + fill, no new dep); `MobileScreen` union gains `"courses"` + `"courseDetail"`; More menu has a "Courses" row; `App.tsx` routes both screens.

- [ ] **Step 1: `BulletBar.tsx`** — RN, `useTheme()` tokens. A track `View` (rounded, `theme.colors.surface2`), three absolute zone `View`s (60/20/20% widths at low opacity of danger/warning/success), a fill `View` width `${pct}%` colored by zone, and a 2px target tick `View` at `left: ${target}%`. Props: `{ value: number | null; target?: number | null; height?: number }`.

- [ ] **Step 2: `MobileAppShell.tsx`** — add `"courses"` and `"courseDetail"` to the `MobileScreen` union and map both to `more` in `screenToTab`. (Leave the 5 bottom tabs unchanged.)

- [ ] **Step 3: `MoreMenuScreen.tsx`** — add a "Courses" row (icon + label) that navigates to the `courses` screen, mirroring the existing "Goals" row markup.

- [ ] **Step 4: `App.tsx`** — read how screens are switched (a `switch`/map on the active screen). Add cases rendering `<CoursesScreen onOpenCourse={(id) => navigate("courseDetail", id)} ... />` and `<CourseDetailScreen courseId={...} onBack={...} />`. Thread the selected course id through the existing navigation state (follow how the app already passes params, e.g. how goal detail or calendar params are handled; if there's no param channel, add a `selectedCourseId` state alongside the screen state).

- [ ] **Step 5: Type-check + commit**

Run: `cd mobile && npx tsc --noEmit`

```bash
git add mobile/components/BulletBar.tsx mobile/components/MobileAppShell.tsx mobile/components/MoreMenuScreen.tsx mobile/App.tsx
git commit -m "feat: wire mobile courses navigation and bullet bar"
```

### Task 10: CoursesScreen (list)

**Files:**
- Create: `mobile/components/CoursesScreen.tsx`

**Interfaces:**
- Consumes: `fetchMobileCourses`, `createMobileCourse` from `../lib/api`; `BulletBar`; `useTheme`.
- Produces: `export function CoursesScreen({ accessToken, onOpenCourse }: { accessToken: string; onOpenCourse: (id: string) => void })`.

- [ ] **Step 1: Implement** — a `FlatList`/`ScrollView` of course cards. Each card (`Pressable` with `android_ripple`, `hitSlop`, ≥44px): name (display font), code/term (muted), average in mono (`—` if null), `<BulletBar value={average} target={targetGrade} />`, gradedWeight caption, and next item chip (`compass` color only for the nearest upcoming). Loading + error + empty states (mirror `GoalsScreen.tsx`). An "Add course" affordance opens a simple inline form or modal calling `createMobileCourse`, then refetch. Safe-area top padding.

- [ ] **Step 2: Type-check + commit**

Run: `cd mobile && npx tsc --noEmit`

```bash
git add mobile/components/CoursesScreen.tsx
git commit -m "feat: add mobile CoursesScreen list"
```

### Task 11: CourseDetailScreen + CourseItemModal

**Files:**
- Create: `mobile/components/CourseDetailScreen.tsx`, `mobile/components/CourseItemModal.tsx`

**Interfaces:**
- Consumes: `fetchMobileCourseDetail`, `saveMobileCategory`, `deleteMobileCategory`, `saveMobileItem`, `setMobileItemGrade`, `deleteMobileItem`, `updateMobileCourse`, `deleteMobileCourse` from `../lib/api`; `BulletBar`; `useTheme`.
- Produces:
  - `CourseDetailScreen({ accessToken, courseId, onBack })` — three stacked, scrollable sections.
  - `CourseItemModal({ visible, initial, categories, onSubmit, onClose })` — add/edit item modal (mirror `CalendarEventModal.tsx`).

- [ ] **Step 1: `CourseDetailScreen`** — fetch detail on mount. Sections:
  1. Grade summary: hero average (mono) + `<BulletBar value={grade.average} target={course.target_grade} />` + "Based on {gradedWeight}%"; weight-sum warning row when present; category rows (name + weight, `BulletBar`, mono score or `—`, "{gradedCount} of {itemCount} graded").
  2. Categories: rows with edit/delete; "Add category" opens a small modal/inline form → `saveMobileCategory`.
  3. Items: **card rows** (never a wide table), grouped by category or date. Each card: kind badge, title, due/scheduled (mono; location for quiz/exam), scheduling-mode pill, and a grade stepper/input that calls `setMobileItemGrade` on submit (`hitSlop` on steppers). Tap a card → open `CourseItemModal` (edit); a "+" opens it (add). After any mutation, refetch detail.
  A back control invokes `onBack`. Safe-area insets top/bottom.

- [ ] **Step 2: `CourseItemModal`** — `Modal` mirroring `CalendarEventModal.tsx`. Fields: Kind selector, Title, Category picker (optional), Due/Scheduled date-time, and — only for quiz/exam — End time + Location; Score max; Estimated effort hours; Scheduling mode selector (Finish first / Ongoing / Do later). Visible labels; `onSubmit` builds the payload for `saveMobileItem`. Datetime uses the app's existing date-picker approach (check `CalendarEventModal.tsx`).

- [ ] **Step 3: Type-check + commit**

Run: `cd mobile && npx tsc --noEmit`

```bash
git add mobile/components/CourseDetailScreen.tsx mobile/components/CourseItemModal.tsx
git commit -m "feat: add mobile course detail screen and item modal"
```

### Task 12: Surface `study` items in the mobile timeline

**Files:**
- Modify: `mobile/components/TodayPlanTimeline.tsx`

- [ ] **Step 1: Read** how the timeline maps `type` → color/label; add a `study` case → "Study" label + `theme.colors.focus` node color (academic blue, not `compass`).

- [ ] **Step 2: Type-check + commit**

Run: `cd mobile && npx tsc --noEmit`

```bash
git add mobile/components/TodayPlanTimeline.tsx
git commit -m "feat: render study items in the mobile timeline"
```

### Task 13: Final verification

- [ ] **Step 1: Web** — `npm run test`, `npm run lint`, `npx tsc -p tsconfig.json --noEmit` all clean.
- [ ] **Step 2: Mobile** — `cd mobile && npx tsc --noEmit` clean; `npx expo start` boots without red-screen (or the project's configured check).
- [ ] **Step 3: Browser walkthrough** — course list → detail → add category/item → enter grade → average updates → generate plan shows a study block. Screenshot each for the record.
- [ ] **Step 4: Commit any fixups**

```bash
git add -A && git commit -m "chore: courses UI lint/type fixups"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** §7 web list/detail/panels → Tasks 4–6; grade viz (bullet hero + category grid) → Tasks 1–2, 5; `study` plan surfacing → Tasks 7, 12; §7 mobile nav/list/detail/modal → Tasks 8–11; token/mono/compass/a11y/motion/touch rules → Global Constraints applied per task.
- **Placeholder scan:** UI assembly tasks specify exact fields, actions, endpoints, and files to mirror, with the novel visuals (bullet bar, inline grade entry) written in full. No "add error handling"-style vagueness — states enumerated (loading/error/empty) and the mirror files named.
- **Type consistency:** mobile DTOs mirror the Plan 1 `CourseSummaryDTO`/row shapes; `focus_mode`/`kind` unions match across web and mobile; action/endpoint names are stable across tasks.
- **Cross-plan dependency:** every consumed symbol (`listCourseSummaries`, `getCourseDetail`, `courseGradeFromRows`, `BulletBar`, `formatGrade`, the four API routes) is produced by Plan 1 or an earlier Plan 2 task.
```
