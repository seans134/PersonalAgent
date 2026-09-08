import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  deleteAccount,
  sendPasswordReset,
  updateBodyMetrics,
  updateEmail,
  updatePlanningPreferences,
} from "./actions";

const WORKOUT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "intense", label: "Intense" },
];

function formatMetric(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(Number(value));
}

function formatTime(value: string | null | undefined) {
  // Postgres time values come back as HH:MM:SS; <input type="time"> wants HH:MM.
  return value ? value.slice(0, 5) : "";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(
      "work_start_time, work_end_time, no_meeting_start, no_meeting_end, focus_block_minutes, workout_preference, timezone",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: bodyProfile } = await supabase
    .from("body_profile_logs")
    .select("height_cm, weight_kg")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 text-ink-muted">Manage your profile, planning preferences, and account.</p>
      </div>

      {params.ok ? (
        <p className="mb-6 rounded-lg border border-success bg-surface2 px-3 py-2 text-sm text-success">{params.ok}</p>
      ) : null}
      {params.error ? (
        <p className="mb-6 rounded-lg border border-danger bg-surface px-3 py-2 text-sm text-danger">{params.error}</p>
      ) : null}

      {/* Planning preferences */}
      <form
        action={updatePlanningPreferences}
        className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-semibold text-ink">Planning preferences</h2>
          <p className="mt-1 text-sm text-ink-muted">The hours and defaults Atlas uses to shape your daily plan.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="work_start_time">
              Work start
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={formatTime(profile?.work_start_time) || "09:00"}
              id="work_start_time"
              name="work_start_time"
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="work_end_time">
              Work end
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={formatTime(profile?.work_end_time) || "17:00"}
              id="work_end_time"
              name="work_end_time"
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="no_meeting_start">
              No-meeting window start
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={formatTime(profile?.no_meeting_start)}
              id="no_meeting_start"
              name="no_meeting_start"
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="no_meeting_end">
              No-meeting window end
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={formatTime(profile?.no_meeting_end)}
              id="no_meeting_end"
              name="no_meeting_end"
              type="time"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="focus_block_minutes">
              Focus block length (min)
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={profile?.focus_block_minutes ?? 60}
              id="focus_block_minutes"
              max={240}
              min={15}
              name="focus_block_minutes"
              type="number"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="workout_preference">
              Workout preference
            </label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              defaultValue={profile?.workout_preference ?? "none"}
              id="workout_preference"
              name="workout_preference"
            >
              {WORKOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="block text-sm text-ink-muted" htmlFor="timezone">
              Timezone
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              defaultValue={profile?.timezone ?? "America/Toronto"}
              id="timezone"
              name="timezone"
              placeholder="America/Toronto"
              type="text"
            />
          </div>
        </div>

        <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
          Save preferences
        </button>
      </form>

      {/* Body metrics */}
      <form action={updateBodyMetrics} className="mb-6 space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink">Body metrics</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Update your current height and weight. Saving records a new entry used by meal and workout suggestions.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="height_cm">
              Height cm
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              defaultValue={formatMetric(bodyProfile?.height_cm)}
              id="height_cm"
              min={1}
              name="height_cm"
              placeholder="178"
              step="0.1"
              type="number"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="weight_kg">
              Weight kg
            </label>
            <input
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              defaultValue={formatMetric(bodyProfile?.weight_kg)}
              id="weight_kg"
              min={1}
              name="weight_kg"
              placeholder="75"
              step="0.1"
              type="number"
            />
          </div>
        </div>
        <button className="rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal" type="submit">
          Save body metrics
        </button>
      </form>

      {/* Account credentials */}
      <section className="mb-6 space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink">Account</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>
          </p>
        </div>

        <form action={updateEmail} className="space-y-3">
          <label className="block text-sm text-ink-muted" htmlFor="email">
            Change email
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
              id="email"
              name="email"
              placeholder="new@email.com"
              required
              type="email"
            />
            <button
              className="shrink-0 rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink transition hover:bg-surface2"
              type="submit"
            >
              Update email
            </button>
          </div>
          <p className="text-xs text-ink-muted">You&apos;ll get a confirmation email at the new address.</p>
        </form>

        <form action={sendPasswordReset} className="space-y-3 border-t border-line pt-6">
          <label className="block text-sm text-ink-muted">Password</label>
          <button
            className="rounded-lg border border-line px-5 py-2 text-sm font-medium text-ink transition hover:bg-surface2"
            type="submit"
          >
            Send password reset link
          </button>
          <p className="text-xs text-ink-muted">We&apos;ll email a reset link to {user.email}.</p>
        </form>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-danger bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Permanently deletes your account and all associated data — goals, schedule, meals, workouts, and courses. This
          cannot be undone.
        </p>
        <form action={deleteAccount} className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="delete_password">
              Confirm your password
            </label>
            <input
              autoComplete="current-password"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted sm:max-w-xs"
              id="delete_password"
              name="password"
              placeholder="Current password"
              required
              type="password"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input className="mt-0.5" name="acknowledge" required type="checkbox" />
            <span>I understand this permanently deletes my account and all my data.</span>
          </label>
          <button
            className="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            type="submit"
          >
            Delete my account
          </button>
        </form>
      </section>

      <div className="mt-8">
        <Link className="text-sm text-ink-muted underline" href="/">
          Back home
        </Link>
      </div>
    </main>
  );
}
