"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for the /courses segment and everything nested under it
 * (including /courses/[id]). Renders a readable message instead of the generic
 * "server-side exception" white screen when course data fails to load — most
 * often because the database schema has not been migrated yet.
 */
export default function CoursesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error in the server/browser console for debugging.
    console.error("Courses route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-16">
      <h1 className="font-display text-xl font-semibold text-ink">
        We couldn&apos;t load your courses
      </h1>
      <p className="text-sm text-ink-muted">
        Something went wrong while loading this page. If this just started after a
        deploy, the courses database tables may not have been migrated yet.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-on-teal transition-colors hover:bg-teal-strong"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface2"
        >
          Back to dashboard
        </Link>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-ink-muted">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
