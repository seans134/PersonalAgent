import type { HabitMetrics, Nudge, NudgeOptions } from "./types";

// Deterministic, supportive nudges derived purely from computed metrics. Endorsements
// celebrate good streaks; improvement nudges point at gaps without shame or pressure.
// These strings are safe by construction (no starvation/guilt/extreme-diet language).

const STREAK_ENDORSE_THRESHOLD = 3;
const REST_DEBT_THRESHOLD = 6; // sessions in a 7-day window with no rest day

function dayWord(count: number): string {
  return count === 1 ? "day" : "days";
}

/** Builds the full ranked nudge list for a metrics snapshot. */
export function computeNudges(metrics: HabitMetrics, options: NudgeOptions = {}): Nudge[] {
  const { nutrition, workouts, streaks, range } = metrics;
  const positives: Nudge[] = [];
  const improvements: Nudge[] = [];

  // --- Endorsements ---
  if (streaks.loggingStreak >= STREAK_ENDORSE_THRESHOLD) {
    positives.push({
      id: "logging-streak",
      tone: "positive",
      metric: "logging",
      message: `You've logged meals ${streaks.loggingStreak} ${dayWord(streaks.loggingStreak)} in a row — that consistency is what makes the rest of this useful.`,
    });
  }

  if (streaks.workoutStreak >= STREAK_ENDORSE_THRESHOLD) {
    positives.push({
      id: "workout-streak",
      tone: "positive",
      metric: "workout",
      message: `${streaks.workoutStreak} ${dayWord(streaks.workoutStreak)} of workouts in a row. Strong momentum — keep riding it.`,
    });
  }

  if (streaks.proteinTargetStreak >= STREAK_ENDORSE_THRESHOLD) {
    positives.push({
      id: "protein-streak",
      tone: "positive",
      metric: "protein",
      message: `You've hit your protein target ${streaks.proteinTargetStreak} ${dayWord(streaks.proteinTargetStreak)} straight. Nicely dialed in.`,
    });
  }

  if (range.days >= 7 && nutrition.loggingConsistency >= 1) {
    positives.push({
      id: "full-week-logged",
      tone: "positive",
      metric: "logging",
      message: "You logged every day this week — a complete picture to work from.",
    });
  }

  const typesTrained = Object.values(workouts.typeBalance).filter((count) => count > 0).length;
  if (range.days >= 7 && typesTrained >= 3) {
    positives.push({
      id: "balanced-training",
      tone: "positive",
      metric: "workout",
      message: "Nice variety across strength, cardio, and recovery this week — a well-rounded mix.",
    });
  }

  // --- Improvements ---
  if (workouts.daysSinceLastWorkout !== null && workouts.daysSinceLastWorkout >= 2) {
    improvements.push({
      id: "workout-gap",
      tone: "improve",
      metric: "workout",
      message: `No workout logged in ${workouts.daysSinceLastWorkout} ${dayWord(workouts.daysSinceLastWorkout)}. Even a short, easy session today keeps the habit alive.`,
    });
  } else if (workouts.sessions === 0) {
    improvements.push({
      id: "no-workouts",
      tone: "improve",
      metric: "workout",
      message: "No workouts logged in this window yet — a brief session is a great place to restart.",
    });
  }

  if (
    nutrition.proteinTarget !== null &&
    nutrition.avgProtein !== null &&
    nutrition.avgProtein < nutrition.proteinTarget * 0.8
  ) {
    improvements.push({
      id: "protein-low",
      tone: "improve",
      metric: "protein",
      message: `Your protein has been averaging below target. A protein-rich snack or a bigger portion at one meal would close the gap.`,
    });
  }

  if (
    nutrition.calorieTarget !== null &&
    nutrition.avgCalories !== null &&
    nutrition.avgCalories > nutrition.calorieTarget * 1.15
  ) {
    improvements.push({
      id: "calories-high",
      tone: "improve",
      metric: "calories",
      message: "Your average calories are running above your target — worth a glance at portion sizes if that isn't intentional.",
    });
  }

  if (range.days >= 3 && nutrition.loggingConsistency < 0.5) {
    improvements.push({
      id: "logging-gaps",
      tone: "improve",
      metric: "logging",
      message: "Logging has been a bit spotty — quick entries, even rough ones, keep these insights accurate.",
    });
  }

  if (range.days >= 7 && workouts.sessions >= REST_DEBT_THRESHOLD && workouts.restDays === 0) {
    improvements.push({
      id: "no-rest-day",
      tone: "improve",
      metric: "workout",
      message: "You trained every day this week with no rest day — recovery is where the gains land, so consider one.",
    });
  }

  return orderNudges(positives, improvements, options);
}

function orderNudges(positives: Nudge[], improvements: Nudge[], options: NudgeOptions): Nudge[] {
  let ordered: Nudge[] = [...positives, ...improvements];

  if (options.focus) {
    const relevant = (nudge: Nudge) =>
      options.focus === "workout"
        ? nudge.metric === "workout"
        : nudge.metric === "protein" || nudge.metric === "calories" || nudge.metric === "logging";
    ordered = [...ordered].sort((a, b) => Number(relevant(b)) - Number(relevant(a)));
  }

  if (typeof options.limit === "number") {
    return ordered.slice(0, Math.max(0, options.limit));
  }
  return ordered;
}
