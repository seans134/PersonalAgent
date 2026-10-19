-- Atlas exam study ramp: a study block checked off as done records its scheduled minutes,
-- so later plans subtract study already done from the item's ramp. Null for older rows,
-- skipped marks, and non-study items. Existing RLS policies on plan_item_statuses cover it.

alter table public.plan_item_statuses
  add column if not exists minutes integer check (minutes is null or minutes between 1 and 1440);
