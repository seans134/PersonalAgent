import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { courseSharePreview, shareCountsLabel } from "@personal-agent/core";
import { resolveCourseShare } from "@/lib/courses/sharing";
import { createClient } from "@/lib/supabase/server";
import { JoinCoursePanel } from "./join-course-panel";

export const metadata: Metadata = {
  title: "Join a course · Atlas",
  // Share links are private to the people they're sent to.
  robots: { index: false, follow: false },
};

export default async function JoinCoursePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unknown, malformed and stopped links all get the same 404.
  const share = await resolveCourseShare(supabase, token);
  if (!share) {
    notFound();
  }

  const preview = courseSharePreview(share.template);
  const meta = [preview.course.code, preview.course.term].filter(Boolean).join(" · ");
  const joinPath = `/join/${token}`;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-6 py-12">
      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-teal">Shared course</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{preview.course.name}</h1>
      {meta ? <p className="mt-2 text-ink-muted">{meta}</p> : null}

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium text-ink">{shareCountsLabel(preview.counts)}</p>
        {preview.categoryCount > 0 ? (
          <p className="mt-1 text-sm text-ink-muted">
            {preview.categoryCount} grade {preview.categoryCount === 1 ? "category" : "categories"} with weights
          </p>
        ) : null}

        <JoinCoursePanel
          ownCourseId={share.ownCourseId}
          signedIn={Boolean(user)}
          signInHref={`/auth?next=${encodeURIComponent(joinPath)}`}
          token={token}
          upcoming={preview.upcoming}
        />
      </section>

      <p className="mt-6 text-xs text-ink-muted">
        A classmate shared this course&apos;s dates and grade weights. Your grades and notes stay private to you.
      </p>
      <Link className="mt-4 inline-block text-sm text-ink-muted underline" href="/">
        Atlas home
      </Link>
    </main>
  );
}
