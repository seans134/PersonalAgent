# Atlas (Phase 2)

Phase 2 includes:
- Supabase email/password authentication
- Onboarding form for goals, schedule constraints, and preferences
- Google Calendar OAuth connect/disconnect
- Read-only fetch of today's Google Calendar events

## Prerequisites

- Node.js 20+
- A Supabase project
- A Google Cloud OAuth client (Web application)

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

4. Configure Google OAuth redirect URI in Google Cloud:

- `http://localhost:3000/calendar/callback`

5. In Supabase SQL editor, run:

- `db/schema.sql`
- `db/google_calendar.sql`

6. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

- `/` home
- `/auth` sign in / sign up
- `/onboarding` onboarding form (requires auth)
- `/calendar` calendar connect + today events
- `/calendar/connect` starts Google OAuth

## Notes

- Planner generation is intentionally out of scope for this phase.
- Google tokens are stored in Supabase with per-user RLS and are accessed only from server code.
