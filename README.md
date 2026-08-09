# Atlas

Atlas is a personal life agent, developed as a **Next.js web app and an Expo
(React Native) mobile app in parallel** — the two share business logic through
the `@personal-agent/core` package and a common set of `/api/mobile/*`
contracts, so features land on both surfaces together rather than web-first.

Current capabilities:
- Supabase email/password authentication
- Onboarding for goals, schedule constraints, and preferences
- Deterministic daily planner endpoint (`POST /api/plan/today`)
- Courses & grade manager: weighted grade categories, assignments/quizzes/exams,
  a live course average, and planner study-time reservation
- Optional Gemini enhancement layer for plan wording and summary (times remain deterministic)

## Prerequisites

- Node.js 20+
- A Supabase project
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for database migrations)
- Gemini API key (optional but recommended for enhancement)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Apply database migrations

Schema lives as versioned migrations in `supabase/migrations/` and is applied
with the Supabase CLI — **never by pasting SQL into the dashboard by hand.**

Link the repo to your Supabase project once, then push the migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase db push` applies every migration in `supabase/migrations/` in order
and records them in the project's migration history, so re-running it only
applies what's new. The migrations are idempotent (`create ... if not exists`,
`add column if not exists`), so pushing to a project that already has some of
the schema is safe.

To add schema later, create a new migration and push it:

```bash
supabase migration new <name>   # creates supabase/migrations/<timestamp>_<name>.sql
# edit the generated file, then:
supabase db push
```

> Operational (non-schema) scripts live in `db/` — e.g.
> `db/revoke_google_calendar_tokens.mjs`, a one-time cleanup that must run
> before the Google Calendar drop migration.

### 3. Configure environment

The web app and the mobile app each have their own env file.

**Web** — copy the example and fill it in:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; required for in-app account deletion)
- `NEXT_PUBLIC_SITE_URL` (usually `http://localhost:3000`)
- `GEMINI_API_KEY` (optional; if missing, planner still works with deterministic copy)
- `GEMINI_MODEL` (optional; default `gemini-2.0-flash`)

**Mobile** — copy `mobile/.env.example` to `mobile/.env` and fill it in
(`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_API_BASE_URL` pointing at your running API, etc.).

## Running the apps

Web and mobile are worked on side by side. Run whichever you're developing —
or both at once in separate terminals.

**Web app** (Next.js):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Mobile app** (Expo):

```bash
cd mobile
npm install
npm run start        # or: npm run ios / npm run android
```

The mobile app talks to the same backend via `EXPO_PUBLIC_API_BASE_URL`, so
point it at your running web/API instance.

## Routes (web)

- `/` home dashboard + generate today plan
- `/auth` sign in / sign up
- `/onboarding` onboarding form (requires auth)
- `/calendar/local` visual day/week/month calendar
- `/courses` course list; `/courses/[id]` grade summary, categories, and items
- `/api/plan/today` generates deterministic plan and optional enhanced copy
- `/api/mobile/*` stable JSON contracts consumed by the mobile app

## Notes

- Business logic (planner, grade math, study-task scheduling) lives in shared,
  pure modules in `packages/core` so it stays identical across web and mobile.
- Planner schedule times are deterministic and are never modified by Gemini enhancement.
- Enhancement failures or unsafe output trigger fallback to deterministic copy with warnings.
