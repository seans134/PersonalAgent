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

create index if not exists schedule_blocks_user_category_idx
on public.schedule_blocks (user_id, category);

alter table public.schedule_blocks enable row level security;

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
