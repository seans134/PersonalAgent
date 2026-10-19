import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ScheduleImportPanel } from "@/components/schedule-import-panel";
export default async function ImportSchedulePage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");
  return <main className="mx-auto max-w-5xl space-y-5 px-6 py-12"><Link href="/calendar/local" className="underline">Back to calendar</Link><h1 className="text-3xl font-semibold">Import schedule</h1><ScheduleImportPanel /></main>;
}
