-- Atlas Today plan check-off: per-item done/skipped marks and the student's "commit to this plan".
-- Marks are keyed by the student's local plan date and a stable item key (see
-- packages/core/src/planner/checkoff.ts), so they survive regenerating the same plan.

create table if not exists public.plan_item_statuses (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  item_key text not null check (length(item_key) between 1 and 200),
  item_type text not null check (item_type in ('goal', 'focus', 'fitness', 'wellness', 'study', 'fallback')),
  status text not null check (status in ('done', 'skipped')),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date, item_key)
);

create table if not exists public.plan_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  item_count integer not null default 0 check (item_count >= 0),
  accepted_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

alter table public.plan_item_statuses enable row level security;
alter table public.plan_acceptances enable row level security;

drop policy if exists "Users read own plan item statuses" on public.plan_item_statuses;
create policy "Users read own plan item statuses" on public.plan_item_statuses
for select using (auth.uid() = user_id);
drop policy if exists "Users write own plan item statuses" on public.plan_item_statuses;
create policy "Users write own plan item statuses" on public.plan_item_statuses
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own plan acceptances" on public.plan_acceptances;
create policy "Users read own plan acceptances" on public.plan_acceptances
for select using (auth.uid() = user_id);
drop policy if exists "Users write own plan acceptances" on public.plan_acceptances;
create policy "Users write own plan acceptances" on public.plan_acceptances
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
