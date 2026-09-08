alter table public.user_profiles
add column if not exists onboarding_completed_at timestamptz;
