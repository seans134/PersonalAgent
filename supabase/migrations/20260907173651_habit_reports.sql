-- Habit Insights: persisted daily digests and weekly reviews.
-- One report per (user, period, period_start); regenerating upserts the row.

create table if not exists public.habit_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null check (period in ('daily', 'weekly')),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  digest jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, period, period_start)
);

create index if not exists habit_reports_user_period_start_idx
on public.habit_reports (user_id, period, period_start desc);

alter table public.habit_reports enable row level security;

drop policy if exists "Users can read own habit reports" on public.habit_reports;
create policy "Users can read own habit reports"
on public.habit_reports
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own habit reports" on public.habit_reports;
create policy "Users can write own habit reports"
on public.habit_reports
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
