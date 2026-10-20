-- Atlas LMS calendar feed import: a student's Canvas / Brightspace / Moodle / Blackboard .ics link,
-- and one row per feed event (by UID) recording what Atlas did with it, so re-syncs update dates
-- instead of duplicating items and never bring back an item the student deleted.
-- Parsing, matching and the sync plan live in packages/core/src/lms-feed; the API that reads and
-- writes these rows is /api/mobile/lms-feed (src/lib/lms-feed).

-- One row per student. feed_url holds the LMS's secret token: the API never returns it (clients get
-- a host-only mask), never logs it, and never puts it in analytics or error reports. It is null until
-- a link has fetched and parsed, and again after a disconnect: the row itself is created on the
-- first connect attempt and kept, so last_attempt_at throttles connects as well as syncs.
create table if not exists public.lms_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  feed_url text check (feed_url is null or (length(feed_url) between 12 and 2048 and feed_url like 'https://%')),
  -- Last successful sync, and its counts ({ events, deadlines, added, updated, needsCourse }).
  last_synced_at timestamptz,
  last_counts jsonb check (last_counts is null or jsonb_typeof(last_counts) = 'object'),
  -- Last connect or sync attempt (claimed atomically: the lock and one-minute throttle) and why it
  -- failed ('internal' = Atlas's own database error); error is null after a success.
  last_attempt_at timestamptz,
  last_error text check (
    last_error is null or last_error in (
      'invalid_url', 'blocked_address', 'unreachable', 'timeout', 'rejected', 'http_error',
      'too_large', 'not_calendar', 'too_many_events', 'too_many_redirects', 'internal'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lms_feeds enable row level security;

drop policy if exists "Users manage own lms feed" on public.lms_feeds;
create policy "Users manage own lms feed" on public.lms_feeds
for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.lms_feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The feed event's UID (e.g. Canvas "event-assignment-123").
  uid text not null check (length(uid) between 1 and 500),
  -- imported: a course item was created (course_item_id). needs_course: no course matched yet; the
  -- student picks one or skips. skipped: the student said no. removed: the student deleted the
  -- imported course item; a re-sync never re-creates it. Deleting a course deletes its items, so its
  -- imported rows also become removed, permanently: re-creating the course later does not bring
  -- those deadlines back (course_id is set null too, so the row keeps no link to the old course).
  status text not null check (status in ('imported', 'needs_course', 'skipped', 'removed')),
  course_item_id uuid references public.course_items (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  -- The event as the feed last described it (the sync updates the course item only when these change).
  kind text not null check (kind in ('assignment', 'quiz', 'exam')),
  title text not null check (length(title) between 1 and 200),
  due_at timestamptz not null,
  end_at timestamptz,
  course_hint text check (course_hint is null or length(course_hint) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, uid),
  check (end_at is null or end_at >= due_at)
);

create unique index if not exists lms_feed_items_course_item_idx
  on public.lms_feed_items (course_item_id) where course_item_id is not null;
create index if not exists lms_feed_items_user_status_idx on public.lms_feed_items (user_id, status);

alter table public.lms_feed_items enable row level security;

drop policy if exists "Users manage own lms feed items" on public.lms_feed_items;
create policy "Users manage own lms feed items" on public.lms_feed_items
for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Keeps rows honest: the course and course item must be the student's own, and deleting an
-- imported course item (on delete set null) marks the row removed so it is never re-imported.
-- Ownership is only checked for values that changed, so the set-null cascades never trip it.
create or replace function public.lms_feed_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.course_id is not null
    and (tg_op = 'INSERT' or new.course_id is distinct from old.course_id or new.user_id is distinct from old.user_id) then
    if not exists (select 1 from public.courses c where c.id = new.course_id and c.user_id = new.user_id) then
      raise exception 'Course not found' using errcode = '23503';
    end if;
  end if;

  if new.course_item_id is not null
    and (tg_op = 'INSERT' or new.course_item_id is distinct from old.course_item_id or new.user_id is distinct from old.user_id) then
    if not exists (select 1 from public.course_items i where i.id = new.course_item_id and i.user_id = new.user_id) then
      raise exception 'Course item not found' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.course_item_id is not null and new.course_item_id is null and new.status = 'imported' then
    new.status := 'removed';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lms_feed_items_before_write on public.lms_feed_items;
create trigger lms_feed_items_before_write
before insert or update on public.lms_feed_items
for each row execute function public.lms_feed_items_before_write();
