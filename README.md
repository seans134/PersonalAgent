# Atlas (Phase 1)

Phase 1 includes:
- Supabase email/password authentication
- Onboarding form for goals, schedule constraints, and preferences
- Supabase SQL schema for `user_profiles` and `goals`

## Prerequisites

- Node.js 20+
- A Supabase project

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

4. In Supabase SQL editor, run:

- `db/schema.sql`

5. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

- `/` home
- `/auth` sign in / sign up
- `/onboarding` onboarding form (requires auth)

## Notes

- Calendar integration and planner are intentionally out of scope for this phase.
