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
  logged_at timestamptz not null default now(),
  workout_type text not null default 'other' check (workout_type in ('strength', 'cardio', 'mobility', 'sport', 'walk', 'other')),
  title text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  intensity text not null default 'moderate' check (intensity in ('light', 'moderate', 'intense')),
  calories_burned integer check (calories_burned is null or calories_burned >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists workout_logs_user_logged_at_idx
on public.workout_logs (user_id, logged_at desc);

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
