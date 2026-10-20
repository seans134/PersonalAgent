import { redirect } from "next/navigation";

// Insights moved to /insights (study time first; the meal and workout digest sits below it).
export default function TrackingInsightsPage() {
  redirect("/insights");
}
