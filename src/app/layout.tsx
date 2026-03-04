import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Atlas onboarding phase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-zinc-100 antialiased">{children}</body>
    </html>
  );
}
