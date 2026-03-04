-- Atlas Phase 2 schema: Google Calendar token storage

create table if not exists public.google_calendar_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_calendar_tokens_expires_at_idx
  on public.google_calendar_tokens (expires_at);

drop trigger if exists set_google_calendar_tokens_updated_at on public.google_calendar_tokens;
create trigger set_google_calendar_tokens_updated_at
before update on public.google_calendar_tokens
for each row execute function public.set_updated_at();

alter table public.google_calendar_tokens enable row level security;

drop policy if exists "Users can read own calendar tokens" on public.google_calendar_tokens;
create policy "Users can read own calendar tokens"
on public.google_calendar_tokens
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own calendar tokens" on public.google_calendar_tokens;
create policy "Users can write own calendar tokens"
on public.google_calendar_tokens
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
