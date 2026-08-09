-- Removes the Google Calendar integration's token storage.
--
-- Run db/revoke_google_calendar_tokens.mjs FIRST. This drop is irreversible and
-- destroys the only copy of the OAuth tokens, after which any grants that were
-- not revoked stay live in users' Google accounts with no way to withdraw them.

drop trigger if exists set_google_calendar_tokens_updated_at on public.google_calendar_tokens;

drop policy if exists "Users can read own calendar tokens" on public.google_calendar_tokens;
drop policy if exists "Users can write own calendar tokens" on public.google_calendar_tokens;

drop index if exists public.google_calendar_tokens_expires_at_idx;

drop table if exists public.google_calendar_tokens;
