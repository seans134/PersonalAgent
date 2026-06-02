import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Atlas onboarding phase",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className="bg-zinc-100 antialiased">
        <AppShell isSignedIn={Boolean(user)}>{children}</AppShell>
      </body>
    </html>
  );
}
