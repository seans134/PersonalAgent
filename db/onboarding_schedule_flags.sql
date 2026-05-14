alter table public.user_profiles
add column if not exists has_school_schedule boolean not null default false;

alter table public.user_profiles
add column if not exists has_work_schedule boolean not null default false;
