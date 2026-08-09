-- Atlas tracking schema: meal logs, workout logs, and body profile snapshots

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text not null default 'meal' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'meal')),
  name text not null,
  calories integer check (calories is null or calories >= 0),
  protein_grams numeric(7, 2) check (protein_grams is null or protein_grams >= 0),
  carbs_grams numeric(7, 2) check (carbs_grams is null or carbs_grams >= 0),
  fat_grams numeric(7, 2) check (fat_grams is null or fat_grams >= 0),
  fiber_grams numeric(7, 2) check (fiber_grams is null or fiber_grams >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists meal_logs_user_logged_at_idx
on public.meal_logs (user_id, logged_at desc);

alter table public.meal_logs
add column if not exists fiber_grams numeric(7, 2) check (fiber_grams is null or fiber_grams >= 0);

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  calories integer check (calories is null or calories >= 0),
  protein_grams numeric(7, 2) check (protein_grams is null or protein_grams >= 0),
  carbs_grams numeric(7, 2) check (carbs_grams is null or carbs_grams >= 0),
  fat_grams numeric(7, 2) check (fat_grams is null or fat_grams >= 0),
  fiber_grams numeric(7, 2) check (fiber_grams is null or fiber_grams >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_meals_user_name_idx
on public.saved_meals (user_id, name);

alter table public.saved_meals
add column if not exists fiber_grams numeric(7, 2) check (fiber_grams is null or fiber_grams >= 0);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_schedule_item_id uuid,
  logged_at timestamptz not null default now(),
  workout_type text not null default 'strength' check (workout_type in ('strength', 'cardio', 'recovery', 'sport')),
  tracking_method text not null default 'sets_reps_weight',
  title text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  intensity text not null default 'moderate' check (intensity in ('light', 'moderate', 'intense')),
  calories_burned integer check (calories_burned is null or calories_burned >= 0),
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_logs_user_logged_at_idx
on public.workout_logs (user_id, logged_at desc);

alter table public.workout_logs
add column if not exists source_schedule_item_id uuid;

alter table public.workout_logs
alter column duration_minutes drop not null;

create index if not exists workout_logs_user_source_schedule_item_idx
on public.workout_logs (user_id, source_schedule_item_id);

alter table public.workout_logs
add column if not exists tracking_method text not null default 'sets_reps_weight';

alter table public.workout_logs
add column if not exists metrics jsonb not null default '{}'::jsonb;

update public.workout_logs
set workout_type = case
  when workout_type = 'mobility' then 'recovery'
  when workout_type = 'walk' then 'cardio'
  when workout_type = 'other' then 'strength'
  else workout_type
end
where workout_type in ('mobility', 'walk', 'other');

update public.workout_logs
set tracking_method = case
  when workout_type = 'strength' then 'sets_reps_weight'
  when workout_type = 'cardio' then 'distance_time'
  when workout_type = 'recovery' then 'mobility_flow'
  when workout_type = 'sport' then 'practice'
  else tracking_method
end
where tracking_method = 'sets_reps_weight'
  and workout_type <> 'strength';

update public.workout_logs
set tracking_method = 'sets_reps_weight'
where tracking_method = 'timed_circuit';

alter table public.workout_logs
drop constraint if exists workout_logs_workout_type_check;

alter table public.workout_logs
add constraint workout_logs_workout_type_check
check (workout_type in ('strength', 'cardio', 'recovery', 'sport'));

alter table public.workout_logs
drop constraint if exists workout_logs_tracking_method_check;

alter table public.workout_logs
add constraint workout_logs_tracking_method_check
check (
  (workout_type = 'strength' and tracking_method in ('sets_reps_weight', 'bodyweight_sets'))
  or (workout_type = 'cardio' and tracking_method in ('distance_time', 'time_only', 'intervals'))
  or (workout_type = 'recovery' and tracking_method in ('mobility_flow', 'stretching', 'breathwork'))
  or (workout_type = 'sport' and tracking_method in ('game', 'practice', 'skills'))
);

create table if not exists public.workout_schedule_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_of_week integer not null check (day_of_week between 1 and 7),
  position integer not null default 0 check (position >= 0),
  workout_type text not null default 'strength' check (workout_type in ('strength', 'cardio', 'recovery', 'sport')),
  tracking_method text not null default 'sets_reps_weight',
  title text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_schedule_items_user_day_position_idx
on public.workout_schedule_items (user_id, day_of_week, position, created_at);

alter table public.workout_logs
drop constraint if exists workout_logs_source_schedule_item_id_fkey;

alter table public.workout_logs
add constraint workout_logs_source_schedule_item_id_fkey
foreign key (source_schedule_item_id)
references public.workout_schedule_items (id)
on delete set null;

alter table public.workout_schedule_items
add column if not exists metrics jsonb not null default '{}'::jsonb;

update public.workout_schedule_items
set tracking_method = 'sets_reps_weight'
where tracking_method = 'timed_circuit';

alter table public.workout_schedule_items
drop constraint if exists workout_schedule_items_tracking_method_check;

alter table public.workout_schedule_items
add constraint workout_schedule_items_tracking_method_check
check (
  (workout_type = 'strength' and tracking_method in ('sets_reps_weight', 'bodyweight_sets'))
  or (workout_type = 'cardio' and tracking_method in ('distance_time', 'time_only', 'intervals'))
  or (workout_type = 'recovery' and tracking_method in ('mobility_flow', 'stretching', 'breathwork'))
  or (workout_type = 'sport' and tracking_method in ('game', 'practice', 'skills'))
);

create table if not exists public.body_profile_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  height_cm numeric(6, 2) check (height_cm is null or height_cm > 0),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg > 0),
  body_fat_percentage numeric(5, 2) check (
    body_fat_percentage is null
    or (body_fat_percentage >= 0 and body_fat_percentage <= 100)
  ),
  maintenance_calories integer check (maintenance_calories is null or maintenance_calories >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists body_profile_logs_user_logged_at_idx
on public.body_profile_logs (user_id, logged_at desc);

alter table public.meal_logs enable row level security;
alter table public.saved_meals enable row level security;
alter table public.workout_logs enable row level security;
alter table public.workout_schedule_items enable row level security;
alter table public.body_profile_logs enable row level security;

drop policy if exists "Users can read own meal logs" on public.meal_logs;
create policy "Users can read own meal logs"
on public.meal_logs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own meal logs" on public.meal_logs;
create policy "Users can write own meal logs"
on public.meal_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own saved meals" on public.saved_meals;
create policy "Users can read own saved meals"
on public.saved_meals
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own saved meals" on public.saved_meals;
create policy "Users can write own saved meals"
on public.saved_meals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own workout logs" on public.workout_logs;
create policy "Users can read own workout logs"
on public.workout_logs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own workout logs" on public.workout_logs;
create policy "Users can write own workout logs"
on public.workout_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own workout schedule items" on public.workout_schedule_items;
create policy "Users can read own workout schedule items"
on public.workout_schedule_items
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own workout schedule items" on public.workout_schedule_items;
create policy "Users can write own workout schedule items"
on public.workout_schedule_items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own body profile logs" on public.body_profile_logs;
create policy "Users can read own body profile logs"
on public.body_profile_logs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can write own body profile logs" on public.body_profile_logs;
create policy "Users can write own body profile logs"
on public.body_profile_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
