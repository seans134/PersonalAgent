import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchTodayCalendarEvents, getCalendarConnectionStatus } from "@/lib/google/calendar";
import { createClient } from "@/lib/supabase/server";

function formatEventTime(value: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; disconnected?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const connection = await getCalendarConnectionStatus(supabase, user.id);
  let events = [] as Awaited<ReturnType<typeof fetchTodayCalendarEvents>>;
  let eventsError = "";

  if (connection.connected) {
    try {
      events = await fetchTodayCalendarEvents(supabase, user.id);
    } catch (error) {
      eventsError = error instanceof Error ? error.message : "Failed to load events.";
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Google Calendar</h1>
          <p className="mt-2 text-zinc-700">Connect your Google account and review today&apos;s events.</p>
        </div>
        <Link className="text-sm text-zinc-600 underline" href="/">
          Back home
        </Link>
      </div>

      {params.error ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {params.error}</p>
      ) : null}
      {eventsError ? (
        <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">Error: {eventsError}</p>
      ) : null}

      {params.connected ? (
        <p className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Google Calendar connected.
        </p>
      ) : null}

      {params.disconnected ? (
        <p className="mb-4 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Google Calendar disconnected.
        </p>
      ) : null}

      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-600">Status</p>
        <p className="mt-1 text-lg font-semibold text-zinc-900">
          {connection.connected ? "Connected" : "Not connected"}
        </p>
        {connection.connected && connection.expiresAt ? (
          <p className="mt-1 text-sm text-zinc-600">Token expires: {new Date(connection.expiresAt).toLocaleString()}</p>
        ) : null}

        <div className="mt-4">
          {!connection.connected ? (
            <a
              className="inline-flex rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white"
              href="/calendar/connect"
            >
              Connect Google Calendar
            </a>
          ) : (
            <form action="/calendar/disconnect" method="post">
              <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm" type="submit">
                Disconnect
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-zinc-900">Today&apos;s Events</h2>
        {!connection.connected ? (
          <p className="mt-3 text-zinc-700">Connect Google Calendar to view today&apos;s schedule.</p>
        ) : events.length === 0 ? (
          <p className="mt-3 text-zinc-700">No events found for today.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {events.map((event) => (
              <li className="rounded-lg border border-zinc-200 p-4" key={event.id}>
                <p className="font-medium text-zinc-900">{event.summary}</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {formatEventTime(event.startsAt)} - {formatEventTime(event.endsAt)}
                </p>
                {event.htmlLink ? (
                  <a
                    className="mt-2 inline-block text-sm text-zinc-700 underline"
                    href={event.htmlLink}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open in Google Calendar
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
