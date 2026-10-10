import { redirect } from "next/navigation";
import { features } from "@personal-agent/core";

// Meal, workout and insights pages are hidden while wellness tracking is switched off.
export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  if (!features.wellnessTracking) {
    redirect("/");
  }

  return children;
}
