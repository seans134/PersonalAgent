import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";
import { redactShareLinksInEvent } from "@personal-agent/core";
import { getMobileEnv } from "./env";

type AnalyticsProperties = Record<string, string | number | boolean | null>;

const { posthogApiKey, posthogHost, sentryDsn } = getMobileEnv();

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  environment: __DEV__ ? "development" : "production",
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});

const posthog = posthogApiKey
  ? new PostHog(posthogApiKey, {
      host: posthogHost,
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      persistence: "file",
      // "Application Opened" records the launch url; a join link's token must not reach analytics.
      before_send: (event) => (event ? redactShareLinksInEvent(event) : event),
    })
  : null;

export function captureEvent(event: string, properties?: AnalyticsProperties) {
  posthog?.capture(event, properties);
}

export function identifyAnalyticsUser(userId: string) {
  posthog?.identify(userId);
  Sentry.setUser({ id: userId });
}

export function resetAnalyticsUser() {
  void posthog?.reset();
  Sentry.setUser(null);
}

export function captureException(error: unknown, context?: AnalyticsProperties) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export { Sentry };
