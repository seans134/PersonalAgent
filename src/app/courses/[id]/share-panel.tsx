"use client";

import { useState } from "react";
import { analyticsEvents } from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";
import type { CourseShareDTO } from "@/lib/courses/sharing";

type ShareResponse = { share: CourseShareDTO; created: boolean } | { error: string };

/** "Share with classmates": one link per course; classmates get the dates and weights, never grades. */
export function SharePanel({
  courseId,
  initialShare,
  archived,
}: {
  courseId: string;
  initialShare: CourseShareDTO | null;
  archived: boolean;
}) {
  const [share, setShare] = useState(initialShare);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(method: "POST" | "DELETE") {
    const response = await fetch(`/api/mobile/courses/${courseId}/share`, { method });
    const body = (await response.json()) as ShareResponse | { ok: true };
    if (!response.ok || "error" in body) {
      throw new Error("error" in body ? body.error : "Unable to update sharing.");
    }
    return body;
  }

  async function handOff(link: CourseShareDTO) {
    // Native share sheet where the browser has one (phones); otherwise copy the link.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join my course on Atlas", url: link.url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    await copy(link.url);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      setNotice("Copy the link above to send it.");
    }
  }

  async function startSharing() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = (await request("POST")) as { share: CourseShareDTO; created: boolean };
      setShare(body.share);
      if (body.created) captureEvent(analyticsEvents.courseShared);
      await handOff(body.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to share course.");
    }
    setBusy(false);
  }

  async function stopSharing() {
    if (!window.confirm("Stop sharing? The link stops working. Classmates who already added the course keep it.")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request("DELETE");
      setShare(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to stop sharing.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">Share with classmates</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Classmates get this course&apos;s dates and grade weights in one tap. Your grades and notes aren&apos;t shared.
      </p>

      {share ? (
        <div className="mt-4 flex flex-col gap-3">
          <input
            aria-label="Share link"
            className="w-full rounded-lg border border-line bg-surface2 px-3 py-2 font-mono text-xs text-ink"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={share.url}
          />
          <p className="text-sm text-ink">
            {share.joinedCount === 1 ? "1 classmate joined" : `${share.joinedCount} classmates joined`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:opacity-60"
              disabled={busy}
              onClick={() => void handOff(share)}
              type="button"
            >
              Share link
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink-muted disabled:opacity-60"
              disabled={busy}
              onClick={() => void copy(share.url)}
              type="button"
            >
              Copy
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm text-danger disabled:opacity-60"
              disabled={busy}
              onClick={() => void stopSharing()}
              type="button"
            >
              Stop sharing
            </button>
          </div>
        </div>
      ) : archived ? (
        <p className="mt-4 text-sm text-ink-muted">Restore this course to share it.</p>
      ) : (
        <button
          className="mt-4 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:opacity-60"
          disabled={busy}
          onClick={() => void startSharing()}
          type="button"
        >
          {busy ? "Creating link..." : "Share with classmates"}
        </button>
      )}

      {notice ? <p className="mt-3 text-sm text-success">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
