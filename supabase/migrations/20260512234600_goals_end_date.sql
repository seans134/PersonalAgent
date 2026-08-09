alter table public.goals
add column if not exists end_date date;

alter table public.goals
add column if not exists description text;

alter table public.goals
add column if not exists completed_at timestamptz;
