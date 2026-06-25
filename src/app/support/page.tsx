import type { Metadata } from "next";
import { DocumentSection, PublicDocument } from "@/components/public-document";

export const metadata: Metadata = {
  title: "Support | Atlas",
  description: "Help and contact options for Atlas.",
};

const issueUrl = "https://github.com/seans134/PersonalAgent/issues/new";

export default function SupportPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

  return (
    <PublicDocument eyebrow="Atlas" title="Support">
      <p>For help with Atlas, use one of the options below. Do not include passwords, authentication tokens, or detailed health information in a support request.</p>

      <DocumentSection title="Contact support">
        {supportEmail ? (
          <p>Email <a className="text-emerald-800 underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
        ) : (
          <p>Open a request in the <a className="text-emerald-800 underline" href={issueUrl}>Atlas issue tracker</a>.</p>
        )}
      </DocumentSection>

      <DocumentSection title="Account access">
        <p>Use <strong>Forgot password?</strong> on the sign-in screen. Open the recovery email on the iPhone where Atlas is installed, then choose a new password in the app.</p>
      </DocumentSection>

      <DocumentSection title="Account deletion">
        <p>In the mobile app, open the menu, choose <strong>Settings &amp; Legal</strong>, and select <strong>Delete Account</strong>. The app will ask for confirmation before permanently deleting the account and associated Atlas data.</p>
      </DocumentSection>

      <DocumentSection title="Troubleshooting">
        <p>Confirm the device has internet access, restart Atlas, and verify the latest build is installed. Calendar, AI, analytics, and crash-reporting features also depend on their production environment configuration.</p>
      </DocumentSection>
    </PublicDocument>
  );
}
