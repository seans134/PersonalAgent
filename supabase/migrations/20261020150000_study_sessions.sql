-- Atlas study timer: time a student spends studying, per course, from the timer or logged by hand.
-- The server owns a running timer's started_at; clients only render the elapsed time. Limits and
-- insights math live in packages/core/src/study-time.

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  course_item_id uuid references public.course_items (id) on delete set null,
  started_at timestamptz not null,
  -- Null while the timer runs.
  ended_at timestamptz,
  -- Whole minutes, stored when the session stops (STUDY_SESSION_MIN/MAX_MINUTES in sessions.ts).
  duration_minutes integer,
  source text not null check (source in ('timer', 'manual')),
  -- The student's local date the session counts toward (profile timezone), so day totals and
  -- streaks don't depend on where a session crosses midnight or on the server's timezone.
  study_date date not null,
  -- Set when the timer was started from a Today study block (plan_item_statuses key and date).
  plan_item_key text check (plan_item_key is null or length(plan_item_key) between 1 and 200),
  plan_date date,
  -- The timer ran past 6 hours and was capped there the next time it was read.
  auto_stopped boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (
    (ended_at is null and duration_minutes is null)
    or (ended_at is not null and duration_minutes is not null and duration_minutes between 1 and 720)
  ),
  check ((plan_item_key is null) = (plan_date is null))
);

-- At most one running timer per student.
create unique index if not exists study_sessions_one_running_idx
  on public.study_sessions (user_id) where ended_at is null;
create index if not exists study_sessions_user_date_idx on public.study_sessions (user_id, study_date);
create index if not exists study_sessions_user_course_idx on public.study_sessions (user_id, course_id);
create index if not exists study_sessions_course_item_idx on public.study_sessions (course_item_id);

alter table public.study_sessions enable row level security;

drop policy if exists "Users manage own study sessions" on public.study_sessions;
create policy "Users manage own study sessions" on public.study_sessions
for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The course and course item must be the student's own, and the item must belong to the course.
-- The API checks this too; the trigger keeps direct writes honest. It only checks values that
-- changed, so the "on delete set null" updates from deleting a course or item never trip it.
create or replace function public.study_sessions_check_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item_course uuid;
begin
  if new.course_id is not null
    and (tg_op = 'INSERT' or new.course_id is distinct from old.course_id or new.user_id is distinct from old.user_id) then
    if not exists (select 1 from public.courses c where c.id = new.course_id and c.user_id = new.user_id) then
      raise exception 'Course not found' using errcode = '23503';
    end if;
  end if;

  if new.course_item_id is not null
    and (tg_op = 'INSERT' or new.course_item_id is distinct from old.course_item_id
      or (new.course_id is not null and new.course_id is distinct from old.course_id)
      or new.user_id is distinct from old.user_id) then
    select i.course_id into item_course
    from public.course_items i where i.id = new.course_item_id and i.user_id = new.user_id;
    if item_course is null then
      raise exception 'Course item not found' using errcode = '23503';
    end if;
    if new.course_id is not null and new.course_id <> item_course then
      raise exception 'Course item belongs to another course' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists study_sessions_check_owner on public.study_sessions;
create trigger study_sessions_check_owner
before insert or update of user_id, course_id, course_item_id on public.study_sessions
for each row execute function public.study_sessions_check_owner();
