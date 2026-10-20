"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyticsEvents,
  LMS_PROVIDER_LABELS,
  lmsFeedSyncedProperties,
  lmsLastSyncedLabel,
  lmsSyncSummary,
  looksLikeLmsFeedUrl,
  type LmsDeadlineKind,
  type LmsFeedStatusResponse,
  type LmsFeedSyncResponse,
  type LmsFeedSyncTrigger,
  type LmsPendingItem,
} from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

type CourseOption = { id: string; name: string; code: string | null };

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted";
const primaryButton =
  "rounded-lg bg-teal px-5 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
  "rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60";

const KIND_LABELS: Record<LmsDeadlineKind, string> = { assignment: "Assignment", quiz: "Quiz", exam: "Exam" };

const WHERE_TO_FIND = [
  { lms: "Canvas", steps: "Calendar → Calendar Feed (bottom of the page) → copy the link." },
  { lms: "Brightspace (D2L)", steps: "Calendar → Subscribe → copy the link." },
  { lms: "Moodle", steps: "Calendar → Import or export calendars → Export → Get calendar URL." },
  { lms: "Blackboard", steps: "Calendar → Settings → Share calendar → copy the link." },
];

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error page; use the fallback below.
  }
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? fallback);
  return body as T;
}

/**
 * Courses: connect an LMS calendar feed (.ics link), sync it, and sort deadlines that didn't match
 * a course. Opening Courses syncs when the last sync is over 12 hours old. Same API as mobile.
 */
export function LmsFeedPanel({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<LmsFeedStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const autoSynced = useRef(false);

  const afterSync = useCallback(
    (result: LmsFeedSyncResponse, trigger: LmsFeedSyncTrigger) => {
      setStatus(result);
      setNow(new Date());
      if (!result.synced || !result.counts) return;
      captureEvent(analyticsEvents.lmsFeedSynced, lmsFeedSyncedProperties(result.counts, trigger));
      if (result.counts.added > 0 || result.counts.updated > 0) router.refresh();
      if (trigger !== "auto" || result.counts.added > 0 || result.counts.updated > 0) {
        setMessage({ tone: "info", text: `Synced: ${lmsSyncSummary(result.counts)}.` });
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await readJson<LmsFeedStatusResponse>(await fetch("/api/mobile/lms-feed"), "Unable to load your LMS feed.");
        if (cancelled) return;
        setStatus(current);
        setLoading(false);
        if (current.feed?.stale && !autoSynced.current) {
          autoSynced.current = true;
          const response = await fetch("/api/mobile/lms-feed/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ifStale: true }),
          });
          // A failed auto-sync is recorded on the feed (lastError) and shown from the reloaded status.
          if (response.ok && !cancelled) afterSync((await response.json()) as LmsFeedSyncResponse, "auto");
          else if (!cancelled) {
            const reloaded = await fetch("/api/mobile/lms-feed");
            if (reloaded.ok) setStatus((await reloaded.json()) as LmsFeedStatusResponse);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to load your LMS feed." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [afterSync]);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!looksLikeLmsFeedUrl(url)) {
      setMessage({ tone: "error", text: "Paste the full calendar feed link. It starts with https:// or webcal://." });
      return;
    }
    setBusy("connect");
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/lms-feed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const result = await readJson<LmsFeedSyncResponse>(response, "Unable to connect your LMS feed.");
      setUrl("");
      setEditing(false);
      afterSync(result, "connect");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to connect your LMS feed." });
    }
    setBusy(null);
  }

  async function syncNow() {
    setBusy("sync");
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/lms-feed/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      afterSync(await readJson<LmsFeedSyncResponse>(response, "Unable to sync your LMS feed."), "manual");
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to sync your LMS feed." });
      const reloaded = await fetch("/api/mobile/lms-feed").catch(() => null);
      if (reloaded?.ok) setStatus((await reloaded.json()) as LmsFeedStatusResponse);
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your LMS feed? Deadlines already added stay in your courses.")) return;
    setBusy("disconnect");
    setMessage(null);
    try {
      await readJson<{ ok: true }>(await fetch("/api/mobile/lms-feed", { method: "DELETE" }), "Unable to disconnect your LMS feed.");
      setStatus({ feed: null, needsCourse: [] });
      setMessage({ tone: "info", text: "LMS feed disconnected. Deadlines already added stay in your courses." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Unable to disconnect your LMS feed." });
    }
    setBusy(null);
  }

  function onPendingResolved(next: LmsFeedStatusResponse, added: boolean) {
    setStatus(next);
    if (added) router.refresh();
  }

  const feed = status?.feed ?? null;
  const showForm = !feed || editing;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Import from your LMS calendar</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Paste your Canvas, Brightspace, Moodle or Blackboard calendar feed link. Atlas adds assignments, quizzes and
          exams to the matching courses and keeps their due dates up to date.
        </p>
      </div>

      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}

      {!loading && feed ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-surface2 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-ink">
              {LMS_PROVIDER_LABELS[feed.provider]} feed <span className="font-mono text-xs text-ink-muted">{feed.maskedUrl}</span>
            </p>
            <p className="text-xs text-ink-muted">
              {lmsLastSyncedLabel(feed.lastSyncedAt, now)}
              {feed.counts ? ` · ${feed.counts.deadlines} deadlines in feed · ${lmsSyncSummary(feed.counts)}` : ""}
            </p>
            {feed.lastErrorMessage ? <p className="text-xs text-danger">Last sync failed: {feed.lastErrorMessage}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryButton} disabled={busy !== null} onClick={syncNow} type="button">
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button className={secondaryButton} disabled={busy !== null} onClick={() => setEditing((value) => !value)} type="button">
              {editing ? "Keep current link" : "Replace link"}
            </button>
            <button
              className="rounded-lg border border-line px-3 py-2 text-sm text-danger transition hover:bg-surface2 disabled:opacity-60"
              disabled={busy !== null}
              onClick={disconnect}
              type="button"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && showForm ? (
        <form className="space-y-3" onSubmit={connect}>
          <div className="space-y-2">
            <label className="block text-sm text-ink-muted" htmlFor="lms-feed-url">
              Calendar feed link
            </label>
            <input
              autoComplete="off"
              className={inputClass}
              id="lms-feed-url"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://yourschool.instructure.com/feeds/calendars/user_….ics"
              spellCheck={false}
              type="url"
              value={url}
            />
            <p className="text-xs text-ink-muted">
              This link works like a password for your LMS calendar. Atlas stores it privately and only uses it to read
              your deadlines.
            </p>
          </div>
          <button className={primaryButton} disabled={busy !== null || !url.trim()} type="submit">
            {busy === "connect" ? "Connecting…" : feed ? "Use this link" : "Connect"}
          </button>
          <details className="text-sm text-ink-muted">
            <summary className="cursor-pointer">Where do I find this link?</summary>
            <ul className="mt-2 space-y-1">
              {WHERE_TO_FIND.map((entry) => (
                <li key={entry.lms}>
                  <span className="font-medium text-ink">{entry.lms}:</span> {entry.steps}
                </li>
              ))}
            </ul>
          </details>
        </form>
      ) : null}

      {message ? (
        <p className={`rounded-lg border bg-surface px-3 py-2 text-sm ${message.tone === "error" ? "border-danger text-danger" : "border-line text-teal"}`}>
          {message.text}
        </p>
      ) : null}

      {status && status.needsCourse.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">
            {status.needsCourse.length} {status.needsCourse.length === 1 ? "deadline needs" : "deadlines need"} a course
          </h3>
          <p className="text-xs text-ink-muted">
            Atlas couldn&apos;t match these to a course. Pick one to add the deadline, or skip it. Later deadlines with the same
            course tag follow your choice.
          </p>
          <ul className="space-y-2">
            {status.needsCourse.map((item) => (
              <PendingRow courses={courses} item={item} key={item.id} onResolved={onPendingResolved} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function PendingRow({
  courses,
  item,
  onResolved,
}: {
  courses: CourseOption[];
  item: LmsPendingItem;
  onResolved: (status: LmsFeedStatusResponse, added: boolean) => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [kind, setKind] = useState<LmsDeadlineKind>(item.kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resolve(body: { action: "skip" } | { action: "assign"; courseId: string; kind: LmsDeadlineKind }) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/mobile/lms-feed/items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onResolved(await readJson<LmsFeedStatusResponse>(response, "Unable to update that deadline."), body.action === "assign");
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Unable to update that deadline.");
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-medium text-ink">{item.title}</p>
        <p className="text-xs text-ink-muted">
          Due {formatDue(item.dueAt)}
          {item.courseHint ? ` · from “${item.courseHint}”` : ""}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <select
        aria-label="Course"
        className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
        disabled={busy || courses.length === 0}
        onChange={(event) => setCourseId(event.target.value)}
        value={courseId}
      >
        <option value="">{courses.length === 0 ? "Add a course first" : "Choose course…"}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.code ? `${course.code} · ${course.name}` : course.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Type"
        className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink"
        disabled={busy}
        onChange={(event) => setKind(event.target.value as LmsDeadlineKind)}
        value={kind}
      >
        {(Object.keys(KIND_LABELS) as LmsDeadlineKind[]).map((value) => (
          <option key={value} value={value}>
            {KIND_LABELS[value]}
          </option>
        ))}
      </select>
      <button
        className={secondaryButton}
        disabled={busy || !courseId}
        onClick={() => void resolve({ action: "assign", courseId, kind })}
        type="button"
      >
        Add
      </button>
      <button
        className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-surface2 disabled:opacity-60"
        disabled={busy}
        onClick={() => void resolve({ action: "skip" })}
        type="button"
      >
        Skip
      </button>
    </li>
  );
}
