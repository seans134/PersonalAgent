import { redirect } from "next/navigation";
import { features, type StudySummary } from "@personal-agent/core";
import { listCourseSummaries } from "@/lib/courses/queries";
import { loadStudySummary } from "@/lib/study/sessions";
import { createClient } from "@/lib/supabase/server";
import { InsightsPanel } from "../tracking/insights/insights-panel";
import { StudyTimePanel } from "./study-time-panel";

// Insights: study time from the study timer and logged sessions. The meal and workout digest
// joins it below while wellness tracking is switched on.
export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const [summary, courses] = await Promise.all([
    loadStudySummary(supabase, user.id).catch((): StudySummary | null => null),
    listCourseSummaries(supabase, user.id).catch(() => []),
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Insights</h1>
        <p className="mt-2 max-w-2xl text-ink-muted">How much you&apos;ve studied this week, by course and by day.</p>
      </div>

      <StudyTimePanel
        courses={courses.map((course) => ({ id: course.id, name: course.name }))}
        initialSummary={summary}
      />

      {features.wellnessTracking ? (
        <div className="mt-10">
          <InsightsPanel />
        </div>
      ) : null}
    </main>
  );
}
