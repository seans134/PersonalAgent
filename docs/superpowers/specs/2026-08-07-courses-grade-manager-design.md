# Courses & Grade Manager — Design

**Date:** 2026-08-07
**Status:** Approved (design), pending implementation plan
**Feature area:** New "Courses" section in Atlas (web + mobile)

## 1. Summary

A school schedule manager inside Atlas that tracks, per course:

- **Weighted grade categories** (e.g. Homework 20%, Midterm 30%, Final 30%, Quizzes 20%).
- **Assignments, quizzes, and exams** as graded items with due dates / scheduled times.
- The **current course average**, computed graded-only with weight re-normalization.

It integrates with Atlas's existing calendar and single-day planner: due dates and exams appear on the calendar, and the planner reserves study time before deadlines based on an optional per-item effort estimate and a per-item scheduling mode (finish-first / continuous / deferred).

Scope: **web + full mobile**, both built in this project. Business logic (grade math, study-task derivation) lives as pure modules in `packages/core` and is consumed by both surfaces, per the mobile-migration guardrails in `AGENTS.md`.

> Note: This diverges from the `AGENTS.md` "validate on web first, then migrate" sequence by the user's explicit choice to build both surfaces together.

## 2. Architecture (Approach A — unified item table + pure core modules)

- One `course_items` table holds assignments, quizzes, and exams with a `kind` discriminator (they share category, grade, and effort fields; only deadline-vs-scheduled-time-and-room differ).
- Grade math and study-time derivation are **pure, tested modules in `packages/core`** — no DB, no I/O — reusable by mobile.
- Course items are **projected** into the existing calendar and planner feeds by a read-adapter. Course tables remain the single source of truth; nothing is denormalized or copied into `calendar_events`.

Rejected alternatives:
- **B — separate `assignments`/`exams` tables:** duplicates CRUD, aggregation, and projection for 90%-identical entities.
- **C — materialize items into `calendar_events` on write:** two sources of truth and a sync problem.

## 3. Data model

Four new user-scoped tables, RLS-enabled, following the existing schema patterns in `db/schema.sql`.

### `courses`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK `auth.users`, `on delete cascade` |
| `name` | text | e.g. "Organic Chemistry" |
| `code` | text null | e.g. "CHEM 201" |
| `color` | text null | optional UI/calendar color |
| `term` | text null | e.g. "Fall 2026" |
| `target_grade` | numeric null | desired grade %, drives the bullet-chart target tick |
| `archived_at` | timestamptz null | archived courses drop off the active list without deletion |
| `created_at` | timestamptz | `now()` |

### `course_categories` — weighted buckets
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid | FK `courses`, cascade |
| `user_id` | uuid | FK `auth.users`, cascade (for RLS) |
| `name` | text | "Homework", "Midterm" |
| `weight` | numeric | percent, e.g. `20.00` |
| `position` | integer | ordering |
| `created_at` | timestamptz | `now()` |

Weights **should** sum to 100 but are **not** DB-enforced (editing would be transiently invalid). The UI shows a "weights sum to 92%, not 100%" warning instead.

### `course_items` — assignments, quizzes, and exams
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid | FK `courses`, cascade |
| `category_id` | uuid null | FK `course_categories`; null = not counted toward average |
| `user_id` | uuid | FK `auth.users`, cascade |
| `kind` | text | `'assignment' \| 'quiz' \| 'exam'` (check constraint) |
| `title` | text | |
| `due_at` | timestamptz | deadline (assignment) or scheduled start (quiz/exam) |
| `end_at` | timestamptz null | quiz/exam end time |
| `location` | text null | quiz/exam room |
| `score_earned` | numeric null | null = not graded yet |
| `score_max` | numeric | default `100` |
| `estimated_effort_hours` | numeric null | optional; drives planner study reservation |
| `focus_mode` | text | `'finish_first' \| 'continuous' \| 'deferred'`, default `'continuous'` (check constraint) |
| `created_at` | timestamptz | `now()` |

**Grade-counting rule (in code, not schema):** an item counts toward the average only when it has a `category_id` **and** a non-null `score_earned`.

**Behavioral split by `kind`** (derived in one place, not a second column):
- `assignment` → **deadline-style**: renders as a due chip; planner treats it as context (a "due today" signal), not a busy block.
- `quiz` / `exam` → **timed-event-style**: renders as a timed block on the calendar and becomes a busy range in the planner.

### `user_profiles.timezone`
Add `timezone text` to `user_profiles` if not already present (roadmap already calls for a required timezone). The projection adapter uses it to convert `due_at`/`end_at` timestamptz into the correct local day and `HH:MM` for the single-day planner.

## 4. Grade-math core module (`packages/core/src/grades/`)

Pure, dependency-free, unit-testable, reused by mobile.

### Inputs (plain data mapped from rows)
```ts
type Category = { id: string; name: string; weight: number };            // weight = percent
type GradedItem = { categoryId: string; scoreEarned: number | null; scoreMax: number };
```

### `computeCourseGrade(categories, items)`
1. Keep only items where `scoreEarned` is non-null (**graded-only**).
2. Group graded items by category. Category raw score = `Σ scoreEarned / Σ scoreMax` across its graded items (**points-summed within a category**, so items weight by their own point value).
3. Drop categories with no graded items.
4. **Re-normalize:** `average = Σ(categoryScore × weight) / Σ(weight)` over surviving categories only.

### Output
```ts
type CourseGrade = {
  average: number | null;          // null when nothing graded → UI shows "—", never 0
  gradedWeight: number;            // e.g. 50 → "based on 50% of your grade so far"
  categories: Array<{
    id: string; name: string; weight: number;
    score: number | null;          // null when no graded items in this category
    gradedCount: number; itemCount: number;
  }>;
  warnings: Array<'weights_sum_not_100'>;  // when Σ all weights ≠ 100 (±0.01)
};
```

### Tests
Nothing graded → null; single category; re-normalization with partial categories; mixed point scales within a category; weights not summing to 100; ungraded exam/quiz excluded.

## 5. Planner integration

**Item state is derived, not stored** (there is no `completed` column):
- **ungraded** = `score_earned` is null.
- **active** = ungraded **and** `due_at` is in the future (local time). A past-due ungraded item is not "active" and neither reserves study time nor suppresses deferred items.

### `deriveStudyTasks` (pure, in the grades module)
For each **active** item (ungraded, future `due_at`) with `estimated_effort_hours` set and `due_at` within a horizon (default 7 days):
1. `daysUntilDue = ceil((dueDate − today) in local days)`, floored at 1.
2. `todaysMinutes = round(effortHours × 60 / daysUntilDue)` — effort spread evenly across remaining days.
3. Clamp to a sane block (15–120 min; longer efforts recur across days rather than one giant block).
4. **Urgency → priority:** due today/tomorrow → 1, within 3 days → 2, else 3.

Each becomes a `TaskBlueprint` with a **new `PlannedItemType: "study"`**, titled e.g. *"Study: Orgo Midterm"*, reason e.g. *"Exam in 2 days · reserving 1 of 3 study sessions."*

### Per-item scheduling mode (`focus_mode`) — overrides urgency-priority
- **`finish_first`** — priority **1**, scheduled **before** everything else (claims best slots), and **front-loaded**: takes up to a larger daily cap (≈2× the even share, bounded by a max block) so it finishes first. Multiple finish-first items order among themselves by due date.
- **`continuous`** (default) — even spread, urgency-scaled priority (2/3), scheduled into free time remaining after finish-first tasks. The "work on while other tasks are ongoing" bucket.
- **`deferred`** — while **any** active finish-first item exists (ungraded, future `due_at`), produces **no** study task (still shows as a deadline chip / exam block so it isn't forgotten). Once no active finish-first items remain, behaves as continuous.

**Daily ordering the planner follows:** finish-first study tasks → continuous → (only if no finish-first remains) deferred-now-continuous. Falls out of assigning priority 1 to finish-first and ordering the blueprint list; deferred items are omitted from the list while finish-first work is active.

**Edge case:** an item marked deferred with no finish-first items present simply runs as continuous; the UI surfaces this state subtly.

### Wiring
- `generateDailyPlan` gains one optional input, `studyTasks`, merged into the blueprint list and scheduled by the existing `scheduleTasks` engine. Existing `academic` context scoring already nudges study blocks near class time.
- `plan-today.ts`: load course items, run `deriveStudyTasks`, pass `studyTasks` in, and include quiz/exam busy-blocks + assignment deadline context via the projection (section 6).
- New `"study"` plan item type gets a label/color in both web (`plan-item-card.tsx`, `today-plan-*`) and mobile (`TodayPlanTimeline.tsx`) renderers.

### Tests
Effort spread across days; urgency→priority mapping; clamping; no-effort items produce no study task; graded and past-due items excluded; finish-first front-loads and outranks continuous; deferred produces no task while a finish-first item is active; deferred reverts to continuous when finish-first items complete; study block places into free time and never overlaps a projected exam block.

## 6. Projection & data-access layer

### Shared data-access lib (`src/lib/courses/`)
One module both web server actions and mobile API routes call — CRUD for courses/categories/items, and mapping rows → core module input types → `computeCourseGrade`. Keeps business logic uncoupled from web-only server actions (guardrail #1).

### `projectCourseItemsToEvents` (read-adapter)
Unioned into the existing `fetchLocalTodayContextEvents` (planner) and the calendar page read path. Course tables stay the single source of truth — editing a due date changes what the projection returns on next read; no sync job.

- `assignment` → **deadline marker** on `due_at`'s local date. Renders as an all-day/deadline chip; in the planner it is **context** ("due today"), not a busy block.
- `quiz` / `exam` → **timed event** from `due_at` to `end_at` (fallback default 60 min quiz / 120 min exam when `end_at` null). In the planner it is a **busy range**, classified `academic` by existing context scoring.

Timezone from `user_profiles.timezone` converts timestamptz → correct local day and `HH:MM`.

## 7. UI/UX design

### Visual language
Atlas "Cartographic" tokens (`packages/core/src/theme`, mirrored in `globals.css`) remain the source of truth — no competing design-system file is generated. From ui-ux-pro-max: adopt the **Data-Dense Dashboard** style at **density 8** (compact 8–32px spacing) plus its UX ruleset. The skill's recommended palette (teal primary + amber accent + grade-green) already matches Atlas tokens.

### Token usage
- **Grades in Space Mono** — averages, scores, and due times use the mono token for tabular numeral alignment.
- **`compass` warm accent = "now"** — reserved for the single most-imminent deadline/exam ("next up"); everything else teal/ink.
- **Grade zones via status tokens** — `danger`/`warning`/`success` for bullet-chart qualitative ranges; numeric grade always shown as text (never color-only).
- **Kind & mode as quiet chips** — `assignment`/`quiz`/`exam` by icon + label; scheduling mode (Finish first / Ongoing / Do later) as a small pill.

### Grade data-viz (custom SVG on web; no new dependency)
- **Hero = bullet chart** — current average as a measured horizontal bar with a **target tick** (`courses.target_grade`) over danger→warning→success zones; big mono number; honest `gradedWeight` caption.
- **Category breakdown = bullet-chart grid** — one row per category: name + weight, zoned score bar, numeric score, "2 of 5 graded". Ungraded categories show an empty track and "—".
- Mobile: flex/`View` bars, or `react-native-svg` if already available in the project (else lightweight views — no new dep without confirmation).

### Web (`src/app/courses/`, added to `app-shell.tsx` nav)
- **`/courses`** — course list. Card per active course: name/code, term, hero **current average** (or "—"), `gradedWeight` caption, next upcoming due/exam. "Add course" form. Archived courses in a collapsed section. Responsive card grid (1 col → 2–3 cols).
- **`/courses/[id]`** — three stacked panels (two-column with sticky summary on wide screens):
  1. **Grade summary** — hero bullet chart, weight-sum warning banner, category breakdown grid.
  2. **Categories editor** — add/rename/reweight/reorder.
  3. **Items list** — assignments/quizzes/exams grouped by category or date; each row: title, kind badge, due/scheduled time, inline `earned / max` grade entry, effort field, scheduling-mode pill. Add/edit form covers all three kinds, showing location/end-time only for quiz/exam. Web tables wrapped in `overflow-x-auto`.
- Server actions with auth + validation inside, `revalidatePath` after (matches `goals/actions.ts`).

### Mobile (`mobile/components/`, data via `mobile/lib/api.ts` → `/api/mobile/courses`)
- Nav: `MobileScreen` gains `"courses"` + `"courseDetail"`, both mapped to the `more` tab in `screenToTab`; a "Courses" row added to `MoreMenuScreen`.
- **`CoursesScreen`** — course list cards (name/code, term, hero average or "—", caption, next item). Tap → detail; "Add course" affordance.
- **`CourseDetailScreen`** — mobile-native version of the three panels, stacked and scrollable; items as **card rows** (no wide tables). Add/edit item as a modal (matching `CalendarEventModal.tsx`), location/end-time only for quiz/exam.
- Plan/calendar surfaces: `"study"` item label/color in `TodayPlanTimeline.tsx`; projected exam/quiz blocks + assignment deadline chips in `CalendarScreen`/`CalendarGrid` via the projection.
- Touch: `Pressable` + `android_ripple`, `hitSlop` on grade steppers and mode pills, 44×44 min, safe-area insets.

### UX rules baked in
- Forms: visible labels (never placeholder-only), **validate on blur**, **loading → success/error** submit feedback.
- Motion 150–300ms; bullet fill animates via `transform: scaleX` (not width), `transform-origin` left; **`prefers-reduced-motion` respected**.
- Accessibility: 4.5:1 contrast in both themes, focus rings kept, grade values always textual.
- Responsive breakpoints: 375 / 768 / 1024 / 1440.

## 8. API contracts (mobile)

RESTful routes under `src/app/api/mobile/courses/`, all backed by `src/lib/courses/`:
- `GET /api/mobile/courses` — list active courses, each with its computed `CourseGrade` summary and next upcoming item.
- `POST /api/mobile/courses` — create course.
- `GET /api/mobile/courses/[id]` — course detail: categories, items, full `CourseGrade`.
- `PATCH` / `DELETE /api/mobile/courses/[id]` — update (incl. archive) / delete.
- Nested category and item CRUD (routes for `categories` and `items` under the course), each validating auth + ownership.

Stable request/response contracts (guardrail #3); no web-only assumptions in payloads (guardrail #4).

## 9. Testing summary
- **Core:** `computeCourseGrade` and `deriveStudyTasks` unit tests (section 4 & 5 lists).
- **Planner:** study tasks placed into free time, never overlapping projected exam blocks; finish-first/continuous/deferred ordering.
- **Lib/API:** CRUD mapping, average aggregation, ownership/auth checks on mobile routes.
- **Projection:** assignment → deadline context; quiz/exam → timed busy block; timezone conversion to correct local day.

## 10. Out of scope (this iteration)
- What-if / projected grade simulator (graded-only headline only).
- Bulk grade entry.
- Recurring auto-generation of items from a syllabus.
- GPA across courses / transcript.
- Dashboard "nearest deadline" widget (optional, minimal if added later).
