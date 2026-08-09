create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null check (category in ('school', 'work', 'study', 'personal', 'unavailable')),
  event_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists calendar_events_user_date_idx
on public.calendar_events (user_id, event_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists "Users can read own calendar events" on public.calendar_events;
create policy "Users can read own calendar events"
on public.calendar_events
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own calendar events" on public.calendar_events;
create policy "Users can write own calendar events"
on public.calendar_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
