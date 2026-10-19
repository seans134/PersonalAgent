import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SCHEDULE_UPLOAD_BYTES, emptyScheduleEntry, scheduleEntryErrors, schedulePreview, scheduleReviewIssues, validDate, type ScheduleImportDraft, type ScheduleImportEntry, type ScheduleImportApplied } from "@personal-agent/core";
import { dateInTimezone, type DayOfWeek, type ScheduleBlock } from "@personal-agent/core/calendar";
import { accountScheduleRequest } from "../lib/account-schedule-api";
import { fetchMobileCalendar, type MobileCalendarResponse, type MobileSyllabusImportFile } from "../lib/api";
import { chooseSyllabusPhoto, takeSyllabusPhoto } from "../lib/syllabus-files";
import { captureEvent } from "../lib/analytics";
import { useTheme } from "../lib/theme";
const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function ScheduleImportScreen({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const theme = useTheme();
  const [file, setFile] = useState<MobileSyllabusImportFile | null>(null);
  const [draft, setDraft] = useState<ScheduleImportDraft>({ entries: [], warnings: [] });
  const [snapshot, setSnapshot] = useState<MobileCalendarResponse | null>(null);
  const [previewDate, setPreviewDate] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState(false); const [allowOverlaps, setAllowOverlaps] = useState(false); const lock = useRef(false);
  async function load() { try { const data = await fetchMobileCalendar(accessToken); setSnapshot(data); setPreviewDate((v) => v || dateInTimezone(new Date(), data.timezone || "America/Toronto")); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load schedule."); } }
  useEffect(() => { void load(); /* Reload when a new signed-in session opens this screen. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);
  const issues = useMemo(() => snapshot ? scheduleReviewIssues(draft, { timezone: snapshot.timezone, scheduleBlocks: snapshot.scheduleBlocks.map((b): ScheduleBlock => ({ ...b, daysOfWeek: b.daysOfWeek as DayOfWeek[] })), events: [...snapshot.events.map((e) => ({ ...e, source: "manual" as const })), ...(snapshot.courseEvents ?? [])] }) : [], [draft, snapshot]);
  const preview = useMemo(() => validDate(previewDate) ? schedulePreview(draft, previewDate) : [], [draft, previewDate]);
  const textStyle = theme.text("body", "ink"); const border = { borderWidth: 1, borderColor: theme.colors.line, borderRadius: 8, padding: 10 };
  function patch(index: number, changes: Partial<ScheduleImportEntry>) { setDraft((d) => ({ ...d, entries: d.entries.map((e, i) => i === index ? { ...e, ...changes } : e) })); setConfirmed(false); setMessage(""); }
  function field(label: string, value: string, onChangeText: (v: string) => void, secure = false) { return <View style={{ gap: 4 }}><Text style={textStyle}>{label}</Text><TextInput accessibilityLabel={label} style={[border, textStyle]} value={value} onChangeText={onChangeText} editable={!busy} autoCapitalize="none" secureTextEntry={secure} /></View>; }
  function button(label: string, onPress: () => void, disabled = false) { return <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={[border, { opacity: disabled || busy ? 0.5 : 1 }]}><Text style={theme.text("label", "teal")}>{label}</Text></Pressable>; }
  async function choose(source: "file" | "photo" | "camera") {
    setError("");
    try {
      if (source === "file") { const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"], multiple: false, copyToCacheDirectory: true }); if (!result.canceled) { const a = result.assets[0]; setFile({ uri: a.uri, name: a.name, type: a.mimeType || (a.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), size: a.size }); } }
      else { const picked = source === "photo" ? await chooseSyllabusPhoto(SCHEDULE_UPLOAD_BYTES) : await takeSyllabusPhoto(SCHEDULE_UPLOAD_BYTES); if (picked) setFile(picked); }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to choose file."); }
  }
  async function parse() {
    if (!file || lock.current) return;
    if (file.size && file.size > SCHEDULE_UPLOAD_BYTES) { setError("Choose a file under 4 MB."); return; }
    lock.current = true; setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      const result = await accountScheduleRequest<{ draft: ScheduleImportDraft }>(accessToken, "/api/mobile/schedule/import/parse", { method: "POST", form });
      setDraft(result.draft); setConfirmed(false); setAllowOverlaps(false); captureEvent("schedule_import_parsed", { entries: result.draft.entries.length, source: file.type === "application/pdf" ? "pdf" : "image" });
      if (!result.draft.entries.length) setMessage("No readable entries found. Try a clearer file or add entries manually.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read schedule."); captureEvent("schedule_import_failed", { stage: "parse" }); } finally { lock.current = false; setBusy(false); }
  }
  async function apply() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const { applied } = await accountScheduleRequest<{ applied: ScheduleImportApplied }>(accessToken, "/api/mobile/schedule/import/apply", { method: "POST", body: { draft, confirmed, allowOverlaps } });
      setMessage(`Saved ${applied.scheduleBlocksCreated} weekly blocks and ${applied.eventsCreated} dated events. Skipped ${applied.skippedDuplicates} duplicates.`);
      captureEvent("schedule_import_completed", { ...applied }); if (applied.scheduleBlocksCreated + applied.eventsCreated) captureEvent("schedule_added", { count: applied.scheduleBlocksCreated + applied.eventsCreated });
      setDraft({ entries: [], warnings: [] }); setConfirmed(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save schedule."); captureEvent("schedule_import_failed", { stage: "apply" }); } finally { lock.current = false; setBusy(false); }
  }
  return <ScrollView style={{ backgroundColor: theme.colors.paper }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
    {button("Back", onBack)}<Text style={theme.text("displayXl", "ink")}>Import schedule</Text><Text style={textStyle}>Add a PDF, photo, or screenshot under 4 MB. Review the times and dates before saving. Atlas does not retain the upload.</Text>
    <View style={{ flexDirection: "row", gap: 8 }}>{button("File", () => void choose("file"))}{button("Photos", () => void choose("photo"))}{button("Camera", () => void choose("camera"))}</View>
    {file && <Text style={textStyle}>{file.name}</Text>}{button("Read schedule", () => void parse(), !file)}
    {button("Add entry manually", () => { setDraft((d) => ({ ...d, entries: [...d.entries, emptyScheduleEntry(snapshot?.timezone || "America/Toronto")] })); setConfirmed(false); }, !snapshot)}
    {!snapshot && button("Retry loading existing schedule", () => void load())}{busy && <ActivityIndicator />}
    {error && <Text accessibilityRole="alert" style={theme.text("body", "danger")}>{error}</Text>}{message && <Text style={theme.text("body", "teal")}>{message}</Text>}{draft.warnings.map((w, i) => <Text key={i} style={textStyle}>{w}</Text>)}
    {draft.entries.map((entry, index) => { const errors = scheduleEntryErrors(entry); return <View key={index} style={[border, { gap: 10 }]}><Text style={theme.text("heading", "ink")}>Entry {index + 1}</Text>
      <Text style={textStyle}>Include entry</Text><Switch accessibilityLabel={`Include entry ${index + 1}`} disabled={busy || errors.length > 0} value={entry.include} onValueChange={(include) => patch(index, { include })} />
      {field("Title", entry.title, (title) => patch(index, { title }))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{(["school", "work", "study", "personal", "unavailable"] as const).map((category) => <View key={category}>{button(`${entry.category === category ? "✓ " : ""}${category}`, () => patch(index, { category }))}</View>)}</View>
      {button(entry.kind === "recurring" ? "Weekly · switch to dated" : "Dated · switch to weekly", () => patch(index, { kind: entry.kind === "recurring" ? "dated" : "recurring" }))}
      <Text style={textStyle}>Timezone: {entry.timezone} (managed in Profile)</Text>
      {field("Starts (HH:MM)", entry.startTime, (startTime) => patch(index, { startTime }))}{field("Ends (HH:MM)", entry.endTime, (endTime) => patch(index, { endTime }))}
      <Text style={textStyle}>Ends the next day</Text><Switch disabled={busy} value={entry.endDayOffset === 1} onValueChange={(v) => patch(index, { endDayOffset: v ? 1 : 0 })} />
      {entry.kind === "dated" ? field("Event date (YYYY-MM-DD)", entry.date || "", (v) => patch(index, { date: v || null })) : <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{dayLabels.map((day, d) => <View key={day}>{button(`${entry.daysOfWeek.includes(d as DayOfWeek) ? "✓ " : ""}${day}`, () => patch(index, { daysOfWeek: entry.daysOfWeek.includes(d as DayOfWeek) ? entry.daysOfWeek.filter((v) => v !== d) : [...entry.daysOfWeek, d as DayOfWeek] }))}</View>)}</View>
        <Text style={textStyle}>Ongoing (no end date)</Text><Switch disabled={busy} value={entry.ongoing} onValueChange={(ongoing) => patch(index, { ongoing, ...(ongoing ? { effectiveUntil: null } : {}) })} />
        {field("First date (YYYY-MM-DD)", entry.effectiveFrom || "", (v) => patch(index, { effectiveFrom: v || null }))}{!entry.ongoing && field("Last date (YYYY-MM-DD)", entry.effectiveUntil || "", (v) => patch(index, { effectiveUntil: v || null }))}
      </>}
      {entry.warnings.map((w, i) => <Text key={i} style={textStyle}>Source note: {w}</Text>)}{errors.map((w) => <Text key={w} style={theme.text("body", "danger")}>{w}</Text>)}
      {issues[index]?.duplicate && <Text style={textStyle}>Duplicate; this entry will be skipped.</Text>}{issues[index]?.overlap && <Text style={theme.text("body", "danger")}>Overlaps another commitment.</Text>}
      {button("Remove entry", () => { setDraft((d) => ({ ...d, entries: d.entries.filter((_, i) => i !== index) })); setConfirmed(false); })}
    </View>; })}
    {draft.entries.length > 0 && <><Text style={theme.text("heading", "ink")}>Calendar preview</Text>{field("Week starting (YYYY-MM-DD)", previewDate, setPreviewDate)}{preview.map((day) => <View style={border} key={day.date}><Text style={theme.text("heading", "ink")}>{day.date}</Text>{day.events.length ? day.events.map((e) => <Text style={textStyle} key={e.id}>{e.startTime}–{e.endTime} {e.title}</Text>) : <Text style={textStyle}>No imported entries</Text>}</View>)}<Text style={textStyle}>Keep overlapping entries if there are conflicts</Text><Switch disabled={busy} value={allowOverlaps} onValueChange={setAllowOverlaps} /><Text style={textStyle}>I reviewed the times, timezone, and date ranges</Text><Switch disabled={busy} value={confirmed} onValueChange={setConfirmed} />{button("Add reviewed schedule", () => void apply(), !snapshot || !confirmed || !draft.entries.some((e) => e.include) || issues.some((i) => i.overlap) && !allowOverlaps)}</>}
  </ScrollView>;
}
