# Roadmap

## Vision
Build PersonalAgent into a mobile-first personal life agent.

## V1 Sprint

### Data Model
- Daily schedule profile:
  - Work hours
  - School hours
  - Usual sleep time
  - Wake-up time
- Body profile:
  - Gender
  - Height
  - Body weight
  - Maintenance calories
  - Suggested macros
- Goals:
  - Store goals (examples: save for a car, invest, learn a new language)
  - Support status tracking (active/completed)

### Product Features
- Goals tab:
  - Add goals
  - Check mark when goal is achieved
- Recurring schedules:
  - School
  - Work
  - Certain repeated events
- Optional/planned events:
  - Going on a run
  - Going out with friends
  - Other user-created events
- Schedule tab:
  - Daily view
  - Weekly view
  - Monthly view

## V2 Sprint
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
- Which V1 feature set is required before mobile migration starts?
- How should goal progress be measured (binary complete vs percentage)?
- What should be fixed constraints vs flexible plan items?
- What level of travel-time accuracy is needed for first release?

## Success Metrics (Draft)
- % users completing onboarding
- % users connecting calendar
- # plans generated per user per week
- % plans accepted without regeneration
- % goals marked completed over time
