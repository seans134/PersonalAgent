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
