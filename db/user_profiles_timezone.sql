alter table public.user_profiles
add column if not exists timezone text not null default 'America/Toronto';
