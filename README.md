# Atlas (Phase 3D)

Phase 3D includes:
- Supabase email/password authentication
- Onboarding form for goals, schedule constraints, and preferences
- Google Calendar OAuth connect/disconnect + read-only events
- Deterministic daily planner endpoint (`POST /api/plan/today`)
- Optional Gemini enhancement layer for plan wording and summary (times remain deterministic)

## Prerequisites

- Node.js 20+
- A Supabase project
- A Google Cloud OAuth client (Web application)
- Gemini API key (optional but recommended for enhancement)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (usually `http://localhost:3000`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GEMINI_API_KEY` (optional; if missing, planner still works with deterministic copy)
- `GEMINI_MODEL` (optional; default `gemini-2.0-flash`)

4. Configure Google OAuth redirect URI in Google Cloud:

- `http://localhost:3000/calendar/callback`

5. In Supabase SQL editor, run:

- `db/schema.sql`
- `db/google_calendar.sql`
- `db/tracking.sql`

6. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

- `/` home dashboard + generate today plan
- `/auth` sign in / sign up
- `/onboarding` onboarding form (requires auth)
- `/calendar` calendar connect + today events
- `/calendar/connect` starts Google OAuth
- `/api/plan/today` generates deterministic plan and optional enhanced copy

## Notes

- Planner schedule times are deterministic and are never modified by Gemini enhancement.
- Enhancement failures or unsafe output trigger fallback to deterministic copy with warnings.
