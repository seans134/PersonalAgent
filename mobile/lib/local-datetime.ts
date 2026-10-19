// Local date/time text-field helpers shared by CourseItemModal and SyllabusImportScreen.

/**
 * Mirrors item-row.tsx's local-time display: splits a stored ISO string into
 * the separate date/time text fields the mobile forms use (see CalendarEventModal,
 * whose date-picker approach — plain "YYYY-MM-DD" + "HH:MM" text inputs — the
 * item modal and syllabus import reuse instead of adding a new date-picker dependency).
 */
export function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Combines the local date/time text fields back into an ISO string, treating
 * them as device-local wall-clock time (matching item-form.tsx's local-time
 * round-trip fix rather than parsing as UTC).
 */
export function combineToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
