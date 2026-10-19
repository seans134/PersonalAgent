# Production analytics

Atlas uses PostHog for product events and Sentry for crashes and unexpected errors. Both integrations stay disabled when their public configuration is absent.

## EAS environment

Configure these values in the EAS production environment:

```text
EXPO_PUBLIC_POSTHOG_API_KEY=phc_...
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

For Sentry source-map uploads, also configure `SENTRY_AUTH_TOKEN` as a secret EAS environment variable. It must not use the `EXPO_PUBLIC_` prefix.

## Privacy boundary

Do not add meal names, calendar titles, goal text, notes, email addresses, or AI conversation content to analytics properties. User identity is the Supabase user UUID only. Session replay is disabled.

## Core loop events

Web and mobile send the same event names, defined once in `packages/core/src/analytics.ts`:

| Event | When | Properties |
|---|---|---|
| `onboarding_completed` | First time the student reaches Done | `courses`, `class_times`, `skipped_setup` |
| `courses_ready` | Same moment, when there is at least one course and class times | `courses`, `class_times` |
| `course_created` | A course is saved | `source` (`manual` / `syllabus_import`), import counts |
| `syllabus_imported` | A reviewed syllabus import is applied | `source` (`photo` / `pdf` / `docx` / `text`), `items`, `categories` |
| `plan_generated` | Today's plan is generated | none |
| `needed_score_viewed` | Course detail shows a needed-score status (once per course per session) | `status` |

The web app uses `NEXT_PUBLIC_POSTHOG_KEY` and optional `NEXT_PUBLIC_POSTHOG_HOST`; with no key it makes no
PostHog calls. Web `course_created` currently fires only for syllabus imports.
