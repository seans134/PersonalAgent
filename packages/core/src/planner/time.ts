export type TimeRange = {
  start: number;
  end: number;
};

export function toMinutes(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time value: ${value}`);
  }

  return hours * 60 + minutes;
}

export function toTimeString(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(totalMinutes)));
  const hours = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function clampRange(range: TimeRange, lower: number, upper: number): TimeRange | null {
  const start = Math.max(range.start, lower);
  const end = Math.min(range.end, upper);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  if (sorted.length === 0) {
    return [];
  }

  const merged: TimeRange[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

export function subtractRanges(windowRange: TimeRange, busyRanges: TimeRange[]): TimeRange[] {
  const mergedBusy = mergeRanges(
    busyRanges
      .map((range) => clampRange(range, windowRange.start, windowRange.end))
      .filter((range): range is TimeRange => range !== null),
  );

  if (mergedBusy.length === 0) {
    return [windowRange];
  }

  const free: TimeRange[] = [];
  let cursor = windowRange.start;

  for (const busy of mergedBusy) {
    if (busy.start > cursor) {
      free.push({ start: cursor, end: busy.start });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (cursor < windowRange.end) {
    free.push({ start: cursor, end: windowRange.end });
  }

  return free;
}
