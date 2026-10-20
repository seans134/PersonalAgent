import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfilePanel } from "@/components/profile-panel";
import { loadSubscriptionStatus } from "@/lib/subscription/usage";
export default async function ProfilePage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/auth");
  const { isPro } = await loadSubscriptionStatus(supabase, user.id);
  return <main className="mx-auto max-w-3xl space-y-6 px-6 py-12"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">Profile</h1>{isPro ? <Link className="rounded-full bg-teal px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-teal" href="/pro">Pro · Supporting Atlas</Link> : <Link className="text-sm text-teal underline" href="/pro?from=profile">Atlas Pro</Link>}</div><ProfilePanel /></main>;
}
