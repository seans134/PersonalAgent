-- Atlas Phase 1 schema: goals, constraints, preferences

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  work_start_time time not null default '09:00',
  work_end_time time not null default '17:00',
  no_meeting_start time,
  no_meeting_end time,
  focus_block_minutes integer not null default 60 check (focus_block_minutes between 15 and 240),
  workout_preference text not null default 'none' check (workout_preference in ('none', 'light', 'moderate', 'intense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  priority smallint not null default 3 check (priority between 1 and 3),
  created_at timestamptz not null default now()
);

create index if not exists goals_user_priority_idx on public.goals (user_id, priority);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.goals enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can upsert own profile" on public.user_profiles;
create policy "Users can upsert own profile"
on public.user_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own goals" on public.goals;
create policy "Users can read own goals"
on public.goals
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own goals" on public.goals;
create policy "Users can write own goals"
on public.goals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
