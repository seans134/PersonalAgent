# Project Working Instructions (PersonalAgent)

These instructions are persistent guidance for coding sessions in this repo.

## Product Direction
- End goal is a mobile app.
- Continue validating core product behavior on web first, then migrate to mobile.

## Mobile Migration Guardrails (Always Apply)
When implementing features now, keep migration easy later by following these rules:
1. Keep business logic API-driven (do not couple critical logic to web-only server actions).
2. Keep planner logic in shared, pure modules.
3. Define stable request/response contracts for endpoints.
4. Avoid web-only assumptions in product copy and flows.
5. Track core loop metrics: onboarding completed, schedule added, plan generated, plan accepted.

## Delivery Prompts / Build Sequence
Use this as the canonical MVP execution checklist:
1. Day 1: Finalize MVP scope, data model, and env contract.
2. Day 2: Set up Supabase auth and protected routes.
3. Day 3: Build onboarding form for goals, constraints, preferences.
4. Day 4: Persist onboarding data and add profile completion checks.
5. Day 5: Implement the local calendar (one-off events + weekly schedule blocks).
6. Day 6: Fetch and normalize today’s calendar events.
7. Day 7: Build recommendation/scoring function (urgency, impact, time-fit, preference-fit).
8. Day 8: Add daily plan generator API endpoint.
9. Day 9: Add dashboard UI for “Generate Today Plan” and plan cards.
10. Day 10: Add safety filters and fallback messaging.
11. Day 11: Add planner unit tests and integration happy-path tests.
12. Day 12: Add error handling for OAuth/token/empty schedule.
13. Day 13: QA pass, bug fixes, copy polish.
14. Day 14: Release checklist, docs, and deploy.
