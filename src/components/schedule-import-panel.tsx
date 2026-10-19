"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SCHEDULE_UPLOAD_BYTES, emptyScheduleEntry, scheduleEntryErrors, schedulePreview, scheduleReviewIssues, validDate, type ScheduleImportDraft, type ScheduleImportEntry, type ScheduleImportApplied } from "@personal-agent/core";
import { dateInTimezone, type CalendarEvent, type ScheduleBlock } from "@personal-agent/core/calendar";
import { captureEvent } from "@/lib/analytics";
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const inputStyle = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink w-full";
type Snapshot = { scheduleBlocks: ScheduleBlock[]; events: CalendarEvent[]; courseEvents?: CalendarEvent[]; timezone: string };
export function ScheduleImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ScheduleImportDraft>({ entries: [], warnings: [] });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [allowOverlaps, setAllowOverlaps] = useState(false);
  const [previewDate, setPreviewDate] = useState("");
  const lock = useRef(false);
  async function loadSnapshot() {
    try {
      const response = await fetch("/api/mobile/calendar", { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load existing schedule.");
      setSnapshot(data); setPreviewDate((current) => current || dateInTimezone(new Date(), data.timezone));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load existing schedule."); }
  }
  useEffect(() => { void loadSnapshot(); }, []);
  function update(index: number, patch: Partial<ScheduleImportEntry>) { setDraft((d) => ({ ...d, entries: d.entries.map((e, i) => i === index ? { ...e, ...patch } : e) })); setConfirmed(false); setMessage(""); }
  const issues = useMemo(() => snapshot ? scheduleReviewIssues(draft, { ...snapshot, events: [...snapshot.events, ...(snapshot.courseEvents ?? [])] }) : [], [draft, snapshot]);
  const preview = useMemo(() => validDate(previewDate) ? schedulePreview(draft, previewDate) : [], [draft, previewDate]);
  async function parse() {
    if (!file || lock.current) return;
    if (file.size > SCHEDULE_UPLOAD_BYTES) { setError("Choose a file under 4 MB."); return; }
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/mobile/schedule/import/parse", { method: "POST", body: form }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to parse schedule.");
      setDraft(data.draft); setConfirmed(false); setAllowOverlaps(false);
      captureEvent("schedule_import_parsed", { entries: data.draft.entries.length, source: file.type === "application/pdf" ? "pdf" : "image" });
      if (!data.draft.entries.length) setMessage("No readable entries found. Try a clearer file or add entries manually.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to parse schedule."); captureEvent("schedule_import_failed", { stage: "parse" }); }
    finally { lock.current = false; setBusy(false); }
  }
  async function apply() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/mobile/schedule/import/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft, confirmed, allowOverlaps }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to save schedule.");
      const applied: ScheduleImportApplied = data.applied;
      setMessage(`Saved ${applied.scheduleBlocksCreated} weekly blocks and ${applied.eventsCreated} dated events. Skipped ${applied.skippedDuplicates} duplicates.`);
      captureEvent("schedule_import_completed", { ...applied });
      if (applied.scheduleBlocksCreated + applied.eventsCreated) captureEvent("schedule_added", { count: applied.scheduleBlocksCreated + applied.eventsCreated });
      setDraft({ entries: [], warnings: [] }); setConfirmed(false); await loadSnapshot();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save schedule."); captureEvent("schedule_import_failed", { stage: "apply" }); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-5">
    <p className="text-ink-muted">Upload a course timetable or work roster. Review every time and date before adding it. Files are processed for extraction and aren’t saved by Atlas.</p>
    <label className="block">PDF or image (up to 4 MB)<input aria-label="Schedule file" className={inputStyle} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
    <button className="rounded-lg bg-teal px-4 py-2 text-on-teal disabled:opacity-50" disabled={!file || busy} onClick={parse}>{busy ? "Working…" : "Read schedule"}</button>
    <button className="ml-3 rounded-lg border border-line px-4 py-2" disabled={busy || !snapshot} onClick={() => { setDraft((d) => ({ ...d, entries: [...d.entries, emptyScheduleEntry(snapshot!.timezone)] })); setConfirmed(false); }}>Add entry manually</button>
    {!snapshot && <button className="underline" onClick={loadSnapshot}>Retry loading existing schedule</button>}
    {error && <p role="alert" className="rounded-lg border border-danger p-3 text-danger">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-success p-3">{message} <Link className="underline" href="/calendar/local">Open calendar</Link></p>}
    {draft.warnings.map((warning, i) => <p key={i} className="text-warning">{warning}</p>)}
    {draft.entries.map((entry, index) => { const errors = scheduleEntryErrors(entry); return <fieldset key={index} disabled={busy} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <legend className="font-semibold">Entry {index + 1}</legend>
      <label className="flex gap-2"><input type="checkbox" checked={entry.include} disabled={errors.length > 0} onChange={(e) => update(index, { include: e.target.checked })} />Include this entry</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Title<input className={inputStyle} value={entry.title} onChange={(e) => update(index, { title: e.target.value })} /></label>
        <label>Category<select className={inputStyle} value={entry.category} onChange={(e) => update(index, { category: e.target.value as ScheduleImportEntry["category"] })}>{["school", "work", "study", "personal", "unavailable"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Schedule type<select className={inputStyle} value={entry.kind} onChange={(e) => update(index, { kind: e.target.value as ScheduleImportEntry["kind"] })}><option value="recurring">Weekly</option><option value="dated">Specific date</option></select></label>
        <p className="self-center text-sm text-ink-muted">Timezone: {entry.timezone}. Change this in Profile if needed.</p>
        <label>Starts<input className={inputStyle} type="time" value={entry.startTime} onChange={(e) => update(index, { startTime: e.target.value })} /></label>
        <label>Ends<input className={inputStyle} type="time" value={entry.endTime} onChange={(e) => update(index, { endTime: e.target.value })} /></label>
      </div>
      <label className="flex gap-2"><input type="checkbox" checked={entry.endDayOffset === 1} onChange={(e) => update(index, { endDayOffset: e.target.checked ? 1 : 0 })} />Ends the next day</label>
      {entry.kind === "dated" ? <label className="block">Event date<input className={inputStyle} type="date" value={entry.date ?? ""} onChange={(e) => update(index, { date: e.target.value || null })} /></label> : <>
        <div className="flex flex-wrap gap-3">{days.map((day, d) => <label key={day}><input type="checkbox" checked={entry.daysOfWeek.includes(d as 0)} onChange={(e) => update(index, { daysOfWeek: e.target.checked ? [...entry.daysOfWeek, d as 0] : entry.daysOfWeek.filter((value) => value !== d) })} /> {day}</label>)}</div>
        <label className="flex gap-2"><input type="checkbox" checked={entry.ongoing} onChange={(e) => update(index, { ongoing: e.target.checked, ...(e.target.checked ? { effectiveUntil: null } : {}) })} />Ongoing (no end date)</label>
        <div className="grid gap-3 sm:grid-cols-2"><label>First date<input className={inputStyle} type="date" value={entry.effectiveFrom ?? ""} onChange={(e) => update(index, { effectiveFrom: e.target.value || null })} /></label><label>Last date<input className={inputStyle} type="date" disabled={entry.ongoing} value={entry.effectiveUntil ?? ""} onChange={(e) => update(index, { effectiveUntil: e.target.value || null })} /></label></div>
      </>}
      {entry.warnings.map((w, i) => <p key={i} className="text-sm text-warning">Source note: {w}</p>)}
      {errors.map((w) => <p key={w} className="text-sm text-danger">{w}</p>)}
      {issues[index]?.duplicate && <p className="text-sm">Already on your schedule; this duplicate will be skipped.</p>}
      {issues[index]?.overlap && <p className="text-sm text-warning">Overlaps another commitment. Review before keeping both.</p>}
      <button className="text-danger underline" onClick={() => { setDraft((d) => ({ ...d, entries: d.entries.filter((_, i) => i !== index) })); setConfirmed(false); }}>Remove entry</button>
    </fieldset>; })}
    {draft.entries.length > 0 && <section className="space-y-3 rounded-xl border border-line p-4">
      <h2 className="text-xl font-semibold">Calendar preview</h2><label>Week starting<input className={inputStyle} type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} /></label>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{preview.map((day) => <div key={day.date} className="rounded-lg bg-surface2 p-3"><h3 className="font-semibold">{day.date}</h3>{day.events.length ? day.events.map((e) => <p key={e.id} className="text-sm">{e.startTime}–{e.endTime} {e.title}</p>) : <p className="text-sm text-ink-muted">No imported entries</p>}</div>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={allowOverlaps} onChange={(e) => setAllowOverlaps(e.target.checked)} />Keep overlapping entries if there are conflicts</label>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I reviewed the times, timezone, and date ranges.</label>
      <button className="rounded-lg bg-teal px-4 py-2 text-on-teal disabled:opacity-50" disabled={busy || !snapshot || !confirmed || !draft.entries.some((e) => e.include) || issues.some((i) => i.overlap) && !allowOverlaps} onClick={apply}>Add reviewed schedule</button>
    </section>}
  </div>;
}
