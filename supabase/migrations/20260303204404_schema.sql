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
  has_school_schedule boolean not null default false,
  has_work_schedule boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  priority smallint not null default 3 check (priority between 1 and 3),
  task_type text not null default 'general' check (task_type in ('general', 'focus', 'fitness', 'wellness', 'admin')),
  minimum_daily_minutes integer not null default 0 check (minimum_daily_minutes between 0 and 720),
  end_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.goals
add column if not exists task_type text not null default 'general';

alter table public.goals
add column if not exists minimum_daily_minutes integer not null default 0;

update public.goals
set task_type = 'general'
where task_type is null
  or task_type not in ('general', 'focus', 'fitness', 'wellness', 'admin', 'exercise', 'wellbeing');

update public.goals
set task_type = 'fitness'
where task_type = 'exercise';

update public.goals
set task_type = 'wellness'
where task_type = 'wellbeing';

update public.goals
set minimum_daily_minutes = least(720, greatest(0, coalesce(minimum_daily_minutes, 0)));

alter table public.goals
alter column task_type set default 'general';

alter table public.goals
alter column task_type set not null;

alter table public.goals
alter column minimum_daily_minutes set default 0;

alter table public.goals
alter column minimum_daily_minutes set not null;

alter table public.goals
drop constraint if exists goals_task_type_check;

alter table public.goals
add constraint goals_task_type_check
check (task_type in ('general', 'focus', 'fitness', 'wellness', 'admin'));

alter table public.goals
drop constraint if exists goals_minimum_daily_minutes_check;

alter table public.goals
add constraint goals_minimum_daily_minutes_check
check (minimum_daily_minutes between 0 and 720);

create index if not exists goals_user_priority_idx on public.goals (user_id, priority);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  category text not null check (category in ('school', 'work', 'study', 'personal', 'unavailable')),
  days_of_week smallint[] not null,
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (cardinality(days_of_week) > 0)
);

create index if not exists schedule_blocks_user_category_idx on public.schedule_blocks (user_id, category);

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
alter table public.schedule_blocks enable row level security;

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

drop policy if exists "Users can read own schedule blocks" on public.schedule_blocks;
create policy "Users can read own schedule blocks"
on public.schedule_blocks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own schedule blocks" on public.schedule_blocks;
create policy "Users can write own schedule blocks"
on public.schedule_blocks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
