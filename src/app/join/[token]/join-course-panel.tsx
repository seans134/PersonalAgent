"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { analyticsEvents, type CourseSharePreview } from "@personal-agent/core";
import { captureEvent } from "@/lib/analytics";

type JoinResponse = { courseId: string; created: boolean; itemCount: number } | { error: string };

const KIND_LABEL: Record<CourseSharePreview["upcoming"][number]["kind"], string> = {
  exam: "Exam",
  quiz: "Quiz",
  assignment: "Assignment",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function JoinCoursePanel({
  token,
  upcoming,
  signedIn,
  signInHref,
  ownCourseId,
}: {
  token: string;
  upcoming: CourseSharePreview["upcoming"];
  signedIn: boolean;
  signInHref: string;
  ownCourseId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/courses/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as JoinResponse;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Unable to add course.");
      }
      if (body.created) captureEvent(analyticsEvents.courseJoined, { item_count: body.itemCount });
      router.push(`/courses/${body.courseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add course.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      {upcoming.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium text-ink-muted">Coming up</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {upcoming.map((item, index) => (
              <li className="flex items-baseline justify-between gap-3 text-sm" key={`${item.dueAt}-${index}`}>
                <span className="text-ink">
                  <span className="text-ink-muted">{KIND_LABEL[item.kind]} · </span>
                  {item.title}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-muted" suppressHydrationWarning>
                  {formatDue(item.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6">
        {ownCourseId ? (
          <Link
            className="inline-flex rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal"
            href={`/courses/${ownCourseId}`}
          >
            This is your course. Open it
          </Link>
        ) : signedIn ? (
          <button
            className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => void join()}
            type="button"
          >
            {busy ? "Adding..." : "Add to my courses"}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <Link className="inline-flex w-fit rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal" href={signInHref}>
              Sign up to add this course
            </Link>
            <p className="text-xs text-ink-muted">
              Already have an account?{" "}
              <Link className="underline" href={signInHref}>
                Sign in
              </Link>{" "}
              and you&apos;ll come right back here.
            </p>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
