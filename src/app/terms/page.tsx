import type { Metadata } from "next";
import Link from "next/link";
import { DocumentSection, PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Terms of Use | Atlas",
  description: "Terms governing use of Atlas.",
};

export default function TermsPage() {
  return (
    <PublicDocument eyebrow="Atlas" title="Terms of Use" updated="June 23, 2026">
      <p>By creating an account or using Atlas, you agree to these terms. If you do not agree, do not use the service.</p>

      <DocumentSection title="Purpose of Atlas">
        <p>Atlas provides personal planning, calendar, meal, workout, reminder, and AI-assisted organization features. Features may change as the product develops.</p>
      </DocumentSection>

      <DocumentSection title="Not medical or professional advice">
        <p>Atlas is not a medical device and does not provide medical, nutritional, fitness, legal, or other professional advice. AI output may be incomplete or wrong. Use your judgment and consult a qualified professional before making decisions involving health, injury, medication, diet, or safety.</p>
        <p>Do not use Atlas for emergencies. Contact local emergency services when immediate help is needed.</p>
      </DocumentSection>

      <DocumentSection title="Your account and content">
        <p>You are responsible for keeping your credentials secure and for activity under your account. Provide only content you have the right to use. You retain responsibility for reviewing plans, suggestions, imported calendar information, and reminders before relying on them.</p>
      </DocumentSection>

      <DocumentSection title="Acceptable use">
        <p>Do not misuse Atlas, attempt unauthorized access, disrupt the service, reverse engineer protected systems, submit unlawful or harmful content, or use automated access in a way that burdens the service.</p>
      </DocumentSection>

      <DocumentSection title="Third-party services">
        <p>Atlas may integrate with Supabase, Google, PostHog, Sentry, hosting providers, and app-distribution platforms. Availability and operation of those services are outside Atlas&apos;s control and may be governed by separate terms.</p>
      </DocumentSection>

      <DocumentSection title="Availability and disclaimers">
        <p>Atlas is provided on an &quot;as is&quot; and &quot;as available&quot; basis to the extent permitted by law. Continuous, secure, or error-free operation is not guaranteed. You should keep independent copies of information you cannot afford to lose.</p>
      </DocumentSection>

      <DocumentSection title="Account termination">
        <p>You may stop using Atlas or delete your account from the mobile app at any time. Atlas may suspend access where reasonably necessary to protect users, comply with law, or address misuse.</p>
      </DocumentSection>

      <DocumentSection title="Changes and contact">
        <p>These terms may be updated as Atlas changes. Continued use after an update means you accept the revised terms where permitted by law. Questions can be submitted through <Link className="text-emerald-800 underline" href="/support">Atlas support</Link>.</p>
      </DocumentSection>
    </PublicDocument>
  );
}
