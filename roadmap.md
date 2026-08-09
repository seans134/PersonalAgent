# Roadmap

## Vision
Build PersonalAgent into a personal life agent delivered on web and mobile together.

## V1 Sprint

**Scope:** Focus on better schedule input, goals that feel real, and a schedule view. Build each feature on web and mobile side by side, backed by shared logic in `packages/core` and the `/api/mobile/*` contracts.
**Out of scope for V1:** Food suggestions, chat-based replanning, and travel-time routing.

### Data Model
- Daily schedule profile:
  - Work hours (existing)
  - School hours
  - Usual sleep time
  - Wake-up time
  - User timezone (required, used for all scheduling and display)
- Goals:
  - Store goals (examples: save for a car, invest, learn a new language)
  - Support status tracking (active/completed)
  - Store `completed_at` timestamp when completed
  - Allow reopen from completed to active
- *Body profile deferred to V2* (needed for food/activity suggestions; no V1 payoff)

### Product Features
- Goals tab:
  - Add goals
  - Mark goal as achieved (check mark)
  - List goals with status (active/completed)
- Recurring schedules:
  - Work and school as explicit recurring blocks first
  - "Certain repeated events" as a second pass (after work/school templates work)
- Optional/planned events (minimal for V1):
  - User-created blocks (e.g. run, going out): title + duration + optional preferred time
  - Enough for planner and daily view; rich recurrence/editing later
- Schedule tab:
  - Daily view (required)
  - Weekly view (target)
  - Monthly view (deferred to V1.5)

### V1 Exit Criteria (Ship Gate)
- User can create/update goals and mark completed.
- User can set work/school/sleep/wake schedule.
- Planner uses recurring blocks plus optional user-created events in daily planning.
- Daily schedule view is stable and usable end-to-end.
- Weekly view is read-only at minimum if included in V1.

## V2 Sprint
- Body profile (from V1 deferral):
  - Gender, height, body weight, maintenance calories, suggested macros
- Suggest foods based on:
  - Macro targets
  - Calories eaten today
  - Protein required
  - Exercises done
- Suggest activities to maintain health
- Chat tab for user prompts
- Add meal timing windows
- Recreate daily plan when user dislikes it, based on user prompts
- Add location data:
  - Home
  - Work
  - School
- Take travel time into account between activities for:
  - Driving
  - Bus
  - Walking
  - Biking

## V3 Sprint
- Interests in onboarding (sports, stocks, etc.)
- Let users add/remove interests over time
- Suggest activities based on interests

## Open Questions
- Which surface (web/mobile) leads for any given feature when parity has to lag briefly, and how do we track catch-up?
- How should goal progress be measured (binary complete vs percentage)?
- What should be fixed constraints vs flexible plan items?
- What level of travel-time accuracy is needed for first release?

## Success Metrics (Draft)
- % users completing onboarding
- % users connecting calendar
- # plans generated per user per week
- % plans accepted without regeneration
- % goals marked completed over time
