import type { Metadata } from "next";
import Link from "next/link";
import { DocumentSection, PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Privacy Policy | Atlas",
  description: "How Atlas collects, uses, and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <PublicDocument eyebrow="Atlas" title="Privacy Policy" updated="June 23, 2026">
      <p>
        This policy explains how Atlas handles information when you use the Atlas web or mobile application. Atlas is a
        planning and wellness tool, not a healthcare provider or medical-record system.
      </p>

      <DocumentSection title="Information you provide">
        <p>Account information includes your email address and authentication details managed by Supabase.</p>
        <p>
          App content may include goals, preferences, calendar events, class and work schedules, daily plans, meals,
          workouts, body-profile measurements, saved meals, notes, and feedback you give to AI-assisted features.
        </p>
      </DocumentSection>

      <DocumentSection title="How information is used">
        <p>Atlas uses this information to authenticate you, synchronize web and mobile data, generate plans and suggestions, send reminders you enable, provide support, secure the service, and improve reliability.</p>
        <p>
          When you use an AI-assisted feature, relevant information may be sent through the Atlas backend to Google Gemini
          to produce the requested draft or suggestion. Do not enter information you do not want processed for that purpose.
        </p>
      </DocumentSection>

      <DocumentSection title="Analytics and diagnostics">
        <p>
          If configured, PostHog receives product events such as whether onboarding completed or a plan was generated.
          Atlas does not intentionally send meal names, goal text, notes, calendar titles, email addresses, or AI conversation
          text as analytics properties. Session replay is disabled.
        </p>
        <p>
          If configured, Sentry receives crash and error diagnostics, device/app information, and your internal Supabase user
          identifier. Default personal-information collection is disabled.
        </p>
      </DocumentSection>

      <DocumentSection title="Service providers">
        <p>Atlas may rely on Supabase for authentication and data storage, Google for Gemini services, PostHog for product analytics, Sentry for diagnostics, and the selected hosting/build providers. Their processing is governed by their own terms and privacy commitments.</p>
      </DocumentSection>

      <DocumentSection title="Retention and deletion">
        <p>
          App content is kept while your account is active. You can delete your account from Settings in the mobile app.
          Deletion removes the Supabase account and associated Atlas database content, including goals, schedules, meals,
          workouts, and body-profile data.
        </p>
        <p>Limited security, legal, aggregated, or diagnostic records may remain where required by law or under a service provider&apos;s documented retention schedule.</p>
      </DocumentSection>

      <DocumentSection title="Security and choices">
        <p>Atlas uses access controls and encrypted network connections, but no online service can guarantee absolute security.</p>
        <p>You can decline notifications, disconnect integrations, avoid optional AI features, or delete your account.</p>
      </DocumentSection>

      <DocumentSection title="Children and changes">
        <p>Atlas is not directed to children under 13. This policy may be updated as the product or its providers change. The effective date above identifies the current version.</p>
      </DocumentSection>

      <DocumentSection title="Contact">
        <p>Questions or privacy requests can be submitted through the <Link className="text-emerald-800 underline" href="/support">Atlas support page</Link>.</p>
      </DocumentSection>
    </PublicDocument>
  );
}
