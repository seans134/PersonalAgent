import { getGoogleOAuthConfig } from "./config";
import type { createClient } from "@/lib/supabase/server";

type CalendarTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  scope: string | null;
  expires_at: string | null;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarEvent = {
  id: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  htmlLink: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function getTodayBounds() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return (await response.json()) as GoogleTokenResponse;
}

async function getTokenRow(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("user_id, access_token, refresh_token, token_type, scope, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load Google Calendar token: ${error.message}`);
  }

  return data as CalendarTokenRow | null;
}

export async function getCalendarConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
) {
  const tokenRow = await getTokenRow(supabase, userId);
  if (!tokenRow) {
    return { connected: false as const, expiresAt: null as string | null };
  }

  return {
    connected: true as const,
    expiresAt: tokenRow.expires_at,
  };
}

export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
) {
  const tokenRow = await getTokenRow(supabase, userId);

  if (!tokenRow) {
    return null;
  }

  const expiresAtMs = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  const needsRefresh = !!tokenRow.refresh_token && Date.now() >= expiresAtMs - 60_000;

  if (!needsRefresh) {
    return tokenRow.access_token;
  }

  const refreshed = await refreshAccessToken(tokenRow.refresh_token as string);

  if (!refreshed.access_token) {
    throw new Error(refreshed.error_description || refreshed.error || "Google token refresh failed");
  }

  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : tokenRow.expires_at;

  const { error: updateError } = await supabase.from("google_calendar_tokens").upsert(
    {
      user_id: userId,
      access_token: refreshed.access_token,
      refresh_token: tokenRow.refresh_token,
      token_type: refreshed.token_type ?? tokenRow.token_type,
      scope: refreshed.scope ?? tokenRow.scope,
      expires_at: nextExpiresAt,
    },
    { onConflict: "user_id" },
  );

  if (updateError) {
    throw new Error(`Unable to store refreshed token: ${updateError.message}`);
  }

  return refreshed.access_token;
}

export async function fetchTodayCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<GoogleCalendarEvent[]> {
  const token = await getValidAccessToken(supabase, userId);
  if (!token) {
    return [];
  }

  const { start, end } = getTodayBounds();

  const query = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Google Calendar token expired. Reconnect your calendar.");
    }
    throw new Error(`Google Calendar request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  return (data.items ?? [])
    .filter((item): item is NonNullable<typeof item> => !!item.id)
    .map((item) => ({
      id: item.id as string,
      summary: item.summary ?? "Untitled event",
      startsAt: item.start?.dateTime ?? item.start?.date ?? "",
      endsAt: item.end?.dateTime ?? item.end?.date ?? "",
      htmlLink: item.htmlLink ?? "",
    }));
}
