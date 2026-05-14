"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveScheduleCommitments(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const hasSchoolSchedule = formData.get("has_school_schedule") === "on";
  const hasWorkSchedule = formData.get("has_work_schedule") === "on";

  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: user.id,
      has_school_schedule: hasSchoolSchedule,
      has_work_schedule: hasWorkSchedule,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect(`/onboarding/schedule?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/onboarding/schedule");
  revalidatePath("/onboarding");
  redirect("/onboarding");
}
