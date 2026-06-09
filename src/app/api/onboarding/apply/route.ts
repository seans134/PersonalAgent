import { NextResponse } from "next/server";
import {
  type NaturalLanguageOnboardingMode,
  type NaturalLanguageOnboardingDraft,
  validateNaturalLanguageOnboardingDraft,
} from "@/lib/onboarding/natural-language";
import { createClient } from "@/lib/supabase/server";

const MODES = new Set(["school_work", "weekly_rhythm", "goals"]);

function hasProfilePatch(draft: NaturalLanguageOnboardingDraft): boolean {
  return Boolean(
    draft.profile.workStartTime ||
      draft.profile.workEndTime ||
      draft.profile.noMeetingStartTime ||
      draft.profile.noMeetingEndTime ||
      draft.profile.focusBlockMinutes ||
      draft.profile.workoutPreference ||
      draft.scheduleBlocks.some((block) => block.category === "school" || block.category === "work"),
  );
}

function toProfilePayload(draft: NaturalLanguageOnboardingDraft, userId: string) {
  return {
    user_id: userId,
    ...(draft.profile.workStartTime ? { work_start_time: draft.profile.workStartTime } : {}),
    ...(draft.profile.workEndTime ? { work_end_time: draft.profile.workEndTime } : {}),
    ...(draft.profile.noMeetingStartTime ? { no_meeting_start: draft.profile.noMeetingStartTime } : {}),
    ...(draft.profile.noMeetingEndTime ? { no_meeting_end: draft.profile.noMeetingEndTime } : {}),
    ...(draft.profile.focusBlockMinutes ? { focus_block_minutes: draft.profile.focusBlockMinutes } : {}),
    ...(draft.profile.workoutPreference ? { workout_preference: draft.profile.workoutPreference } : {}),
    ...(draft.scheduleBlocks.some((block) => block.category === "school") ? { has_school_schedule: true } : {}),
    ...(draft.scheduleBlocks.some((block) => block.category === "work") ? { has_work_schedule: true } : {}),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as { draft?: unknown; mode?: unknown; timezone?: unknown };
  const mode = typeof payload.mode === "string" && MODES.has(payload.mode) ? (payload.mode as NaturalLanguageOnboardingMode) : null;
  const timezone = typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone.trim() : "America/Toronto";

  if (!mode) {
    return NextResponse.json({ error: "Invalid onboarding parser mode." }, { status: 400 });
  }

  let draft: NaturalLanguageOnboardingDraft;
  try {
    draft = validateNaturalLanguageOnboardingDraft(payload.draft, mode, timezone);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid onboarding draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (hasProfilePatch(draft)) {
    const { error } = await supabase
      .from("user_profiles")
      .upsert(toProfilePayload(draft, user.id), { onConflict: "user_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (draft.goals.length > 0) {
    const { error } = await supabase.from("goals").insert(
      draft.goals.map((goal) => ({
        user_id: user.id,
        title: goal.title,
        description: goal.description || null,
        priority: goal.priority,
        end_date: goal.endDate || null,
      })),
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (draft.scheduleBlocks.length > 0) {
    const { error } = await supabase.from("schedule_blocks").insert(
      draft.scheduleBlocks.map((block) => ({
        user_id: user.id,
        title: block.title,
        category: block.category,
        days_of_week: block.daysOfWeek,
        start_time: block.startTime,
        end_time: block.endTime,
        timezone: block.timezone,
      })),
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      applied: {
        profileUpdated: hasProfilePatch(draft),
        goalsCreated: draft.goals.length,
        scheduleBlocksCreated: draft.scheduleBlocks.length,
      },
    },
    { status: 200 },
  );
}
