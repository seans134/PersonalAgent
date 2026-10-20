-- Atlas Pro: one entitlement row per student, written only by the server's Stripe and RevenueCat
-- webhooks (service role); a log of syllabus imports for the free-tier limit; and processed webhook
-- event ids so a redelivered event is applied once.
-- Plan/limit logic lives in packages/core/src/subscription; the server code is src/lib/subscription.

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Atlas has a single paid entitlement today.
  entitlement text not null default 'pro' check (entitlement = 'pro'),
  -- Which store last set this row.
  source text not null check (source in ('stripe', 'revenuecat')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  plan text check (plan is null or plan in ('monthly', 'yearly')),
  -- Stripe price id or App Store / Play product id.
  product_id text check (product_id is null or length(product_id) <= 200),
  current_period_end timestamptz,
  stripe_customer_id text check (stripe_customer_id is null or length(stripe_customer_id) <= 200),
  stripe_subscription_id text check (stripe_subscription_id is null or length(stripe_subscription_id) <= 200),
  revenuecat_app_user_id text check (revenuecat_app_user_id is null or length(revenuecat_app_user_id) <= 200),
  -- Store time of the newest event applied, so an older event delivered late can't roll the row back.
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_entitlements_stripe_customer_idx
  on public.user_entitlements (stripe_customer_id) where stripe_customer_id is not null;

alter table public.user_entitlements enable row level security;

-- Students can read their own entitlement. There are deliberately no insert/update/delete policies:
-- only the service role (which bypasses RLS) writes it, from verified webhooks.
drop policy if exists "Users read own entitlement" on public.user_entitlements;
create policy "Users read own entitlement" on public.user_entitlements
for select using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.user_entitlements from anon, authenticated;

-- One row per successful syllabus import (the course it created may later be deleted; the import
-- still counts toward that term). Students can add their own rows and read them, never change or
-- delete them, so the count can't be reset from the client.
create table if not exists public.syllabus_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists syllabus_imports_user_created_idx on public.syllabus_imports (user_id, created_at);

alter table public.syllabus_imports enable row level security;

drop policy if exists "Users read own syllabus imports" on public.syllabus_imports;
create policy "Users read own syllabus imports" on public.syllabus_imports
for select using ((select auth.uid()) = user_id);

drop policy if exists "Users record own syllabus imports" on public.syllabus_imports;
create policy "Users record own syllabus imports" on public.syllabus_imports
for insert with check (
  (select auth.uid()) = user_id
  and (course_id is null or exists (
    select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())
  ))
);

revoke update, delete, truncate on public.syllabus_imports from anon, authenticated;

-- Webhook deliveries already applied ("stripe:evt_..." / "revenuecat:<event id>"). Service role only:
-- RLS on with no policies.
create table if not exists public.billing_webhook_events (
  id text primary key check (length(id) between 3 and 300),
  provider text not null check (provider in ('stripe', 'revenuecat')),
  event_type text not null check (length(event_type) <= 100),
  received_at timestamptz not null default now()
);

alter table public.billing_webhook_events enable row level security;

revoke all on public.billing_webhook_events from anon, authenticated;
