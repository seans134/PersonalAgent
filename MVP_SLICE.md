# Atlas MVP Thin Slice (Step 1)

## Goal
Ship one narrow but real workflow:
- User sets goals/preferences
- User adds classes, shifts, and recurring commitments
- User clicks "Generate Today Plan"
- App returns a practical day plan based on free calendar time

## Included (v0)
1. Authentication (email sign-in)
2. Onboarding form
- Goals (free text + priority)
- Daily constraints (work hours, no-meeting windows)
- Preferences (focus block length, workout preference)
3. Local calendar (one-off events + weekly schedule blocks)
4. Calendar ingestion for today's events
5. Planner endpoint:
- Inputs: profile + today's calendar events
- Output: ordered list of today actions with time blocks
6. Simple dashboard:
- "Generate Today Plan" button
- Render plan cards with time, title, reason

## Excluded (for later)
1. Apple/Outlook calendar
2. Auto-scheduling events back to calendar
3. Meal planning
4. Habit streak analytics
5. Push/email reminders
6. Weekly review automation

## User Story
As a busy user, I want Atlas to turn my goals into a realistic plan for today using my real calendar, so I can execute instead of manually planning.

## Acceptance Criteria
1. New user can complete onboarding in under 3 minutes.
2. User can add events and weekly blocks and see today's schedule.
3. Clicking "Generate Today Plan" returns at least 3 actionable items when free time exists.
4. Generated plan avoids overlapping existing calendar events.
5. Plan includes at least:
- One top-priority goal action
- One health/wellbeing action (if preference enabled)
- One focus block
6. If free time is too limited, app returns a constrained plan with explanation.
7. No medical/extreme advice appears in output.

## Technical Definition of Done
1. `README.md` with local run instructions
2. `.env.example` with required env vars
3. DB schema for user profile + goals + preferences
4. Planner logic covered by basic unit tests
5. Basic error handling for empty schedule data

## Build Order
1. Bootstrap app + auth
2. Add onboarding data model + form
3. Add local calendar events + weekly schedule blocks
4. Implement planner logic and tests
5. Build dashboard and connect endpoint
6. Add guardrails and fallback messaging

