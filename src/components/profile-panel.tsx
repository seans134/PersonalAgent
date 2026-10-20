"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { defaultAtlasProfile, GPA_SCALE_IDS, GPA_SCALES, isGpaScaleId, type AtlasProfile } from "@personal-agent/core";
import { createClient } from "@/lib/supabase/client";
const inputStyle = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink";
export function ProfilePanel() {
  const [profile, setProfile] = useState<AtlasProfile>(defaultAtlasProfile);
  const [email, setEmail] = useState(""); const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmation, setConfirmation] = useState(""); const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [appearance, setAppearance] = useState("system");
  useEffect(() => { setAppearance(localStorage.getItem("atlas.theme") || "system"); void fetch("/api/mobile/profile", { cache: "no-store" }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setProfile(data.profile); setEmail(data.email); if (data.pendingEmail) setMessage("An email change is awaiting confirmation."); setLoaded(true); }).catch((e) => setError(e.message)); }, []);
  async function action(url: string, body: unknown, method = "POST") {
    if (busy) return; setBusy(true); setError(""); setMessage("");
    try { const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save changes."); setMessage(data.message || "Profile saved."); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); if (data.deleted) { await createClient().auth.signOut(); window.location.assign("/auth"); } }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save changes."); } finally { setBusy(false); }
  }
  const field = (key: Exclude<keyof AtlasProfile, "gpa_scale">, label: string, type = "text") => <label className="block" key={key}>{label}<input className={inputStyle} type={type} value={profile[key] ?? ""} min={key === "focus_block_minutes" ? 15 : undefined} max={key === "focus_block_minutes" ? 240 : undefined} onChange={(e) => setProfile({ ...profile, [key]: type === "number" ? Number(e.target.value) : e.target.value || (key.startsWith("no_meeting") ? null : "") })} /></label>;
  return <div className="space-y-6">
    {error && <p role="alert" className="text-danger">{error}</p>}{message && <p role="status" className="text-success">{message}</p>}
    <fieldset disabled={busy || !loaded} className="space-y-4 rounded-xl border border-line bg-surface p-5"><legend className="font-semibold">Personal details & planning</legend><p>{email}</p>
      {field("display_name", "Display name")}{field("timezone", "Timezone")}
      <p className="text-sm text-ink-muted">Schedules use local wall-clock times. Changing timezone keeps the times you entered.</p>
      <div className="grid gap-3 sm:grid-cols-2">{field("work_start_time", "Work start", "time")}{field("work_end_time", "Work end", "time")}{field("no_meeting_start", "Unavailable from", "time")}{field("no_meeting_end", "Unavailable until", "time")}{field("focus_block_minutes", "Focus block length (minutes)", "number")}</div>
      <label className="block">GPA scale<select className={inputStyle} value={profile.gpa_scale} onChange={(e) => { if (isGpaScaleId(e.target.value)) setProfile({ ...profile, gpa_scale: e.target.value }); }}>{GPA_SCALE_IDS.map((id) => <option key={id} value={id}>{GPA_SCALES[id].label}</option>)}</select></label>
      <button className="rounded-lg bg-teal px-4 py-2 text-on-teal" onClick={() => action("/api/mobile/profile", { profile }, "PATCH")}>Save profile</button>
    </fieldset>
    <fieldset disabled={busy || !loaded} className="space-y-3 rounded-xl border border-line p-5"><legend className="font-semibold">Account</legend>
      <label className="block">Current password<input className={inputStyle} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
      <label className="block">New email<input className={inputStyle} type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
      <button className="underline" onClick={() => action("/api/mobile/account/manage", { action: "email", email: newEmail, currentPassword })}>Change email</button>
      <label className="block">New password<input className={inputStyle} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
      <label className="block">Confirm new password<input className={inputStyle} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
      <button className="mr-4 underline" onClick={() => action("/api/mobile/account/manage", { action: "password", currentPassword, newPassword, confirmPassword })}>Change password</button>
      <button className="underline" onClick={() => action("/api/mobile/account/manage", { action: "recovery" })}>Forgot password? Send recovery email</button>
    </fieldset>
    <section className="space-y-3 rounded-xl border border-line p-5"><h2 className="font-semibold">Preferences</h2><label>Appearance<select className={inputStyle} value={appearance} onChange={(e) => { const next = e.target.value; setAppearance(next); localStorage.setItem("atlas.theme", next); if (next === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", next); window.dispatchEvent(new Event("storage")); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><p className="text-sm text-ink-muted">Exam and daily-plan reminders are managed in Profile → Notifications in the mobile app.</p><Link className="block underline" href="/onboarding">Weekly rhythm</Link><Link className="block underline" href="/onboarding/schedule">School & work</Link></section>
    <section className="flex flex-wrap gap-4"><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><button disabled={busy} className="underline" onClick={async () => { await createClient().auth.signOut(); window.location.assign("/auth"); }}>Sign out</button></section>
    <section className="space-y-3 rounded-xl border border-danger p-5"><h2 className="font-semibold text-danger">Delete account</h2><p>Account deletion permanently removes your Atlas data. This cannot be undone.</p><button className="text-danger underline" onClick={() => setDeleting(!deleting)}>Delete account…</button>{deleting && <><label className="block">Type DELETE to confirm<input className={inputStyle} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label><p className="text-sm">Enter your current password in Account above.</p><button disabled={busy || confirmation !== "DELETE" || !currentPassword} className="rounded-lg bg-danger px-4 py-2 text-white disabled:opacity-50" onClick={() => action("/api/mobile/account", { confirmation, password: currentPassword }, "DELETE")}>Permanently delete my account</button></>}</section>
  </div>;
}
