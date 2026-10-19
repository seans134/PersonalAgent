-- Atlas shareable course links: a student shares a course as a template; classmates open
-- /join/<token> (or atlas://join/<token>) and add their own copy. One active share per course;
-- "Stop sharing" sets revoked_at. Only the owner can see or manage their shares.

create table if not exists public.course_shares (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- base64url of >= 16 random bytes (packages/core shareTokenFromBytes), generated server-side.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22,128}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists course_shares_one_active_idx
  on public.course_shares (course_id) where revoked_at is null;
create index if not exists course_shares_user_idx on public.course_shares (user_id);

-- A course added from a share remembers it, so joining twice returns the same course
-- and the owner can see how many classmates joined.
alter table public.courses
  add column if not exists joined_from_share_id uuid references public.course_shares (id) on delete set null;

create unique index if not exists courses_user_joined_share_idx
  on public.courses (user_id, joined_from_share_id) where joined_from_share_id is not null;
create index if not exists courses_joined_share_idx
  on public.courses (joined_from_share_id) where joined_from_share_id is not null;

alter table public.course_shares enable row level security;

drop policy if exists "Users read own course shares" on public.course_shares;
create policy "Users read own course shares" on public.course_shares
for select using (auth.uid() = user_id);
drop policy if exists "Users write own course shares" on public.course_shares;
create policy "Users write own course shares" on public.course_shares
for all using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
);

-- Resolving a token. Classmates can't read the owner's rows under RLS, so this SECURITY DEFINER
-- function is the only path from a token to a course. It was chosen over a service-role route
-- because it needs no service key on the web server, works for anon and signed-in callers alike,
-- and its fixed column list is the whole exposure: course name/code/term, category name/weight,
-- and item kind/title/dates/score_max/effort. Never scores, notes, target grades, location, or
-- the owner's id. ownCourseId is set only when the caller is the owner (so they aren't offered a
-- copy of their own course). Unknown, revoked, or archived shares all return null.
create or replace function public.course_share_template(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with share as (
    select s.id as share_id, s.user_id as owner_id, c.id as course_id, c.name, c.code, c.term
    from public.course_shares s
    join public.courses c on c.id = s.course_id and c.user_id = s.user_id
    where s.token = share_token and s.revoked_at is null and c.archived_at is null
  ),
  cats as (
    select cc.id, cc.name, cc.weight,
      row_number() over (order by cc.position, cc.created_at, cc.id) - 1 as idx
    from public.course_categories cc
    join share on cc.course_id = share.course_id and cc.user_id = share.owner_id
  )
  select jsonb_build_object(
    'shareId', share.share_id,
    'ownCourseId', case when share.owner_id = (select auth.uid()) then share.course_id end,
    'course', jsonb_build_object('name', share.name, 'code', share.code, 'term', share.term),
    'categories', coalesce(
      (select jsonb_agg(jsonb_build_object('name', cats.name, 'weight', cats.weight) order by cats.idx) from cats),
      '[]'::jsonb
    ),
    'items', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'kind', i.kind, 'title', i.title, 'dueAt', i.due_at, 'endAt', i.end_at, 'scoreMax', i.score_max,
          'estimatedEffortHours', i.estimated_effort_hours, 'categoryIndex', cats.idx
        ) order by i.due_at, i.id)
       from public.course_items i
       left join cats on cats.id = i.category_id
       where i.course_id = share.course_id and i.user_id = share.owner_id),
      '[]'::jsonb
    )
  )
  from share;
$$;

revoke all on function public.course_share_template(text) from public;
grant execute on function public.course_share_template(text) to anon, authenticated;

-- "N classmates joined": counts courses added from any share (current or revoked) of the
-- caller's own course. Joined courses belong to other students, so RLS would hide them.
create or replace function public.course_share_join_count(target_course_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.courses joined
  join public.course_shares s on s.id = joined.joined_from_share_id
  where s.course_id = target_course_id and s.user_id = (select auth.uid());
$$;

revoke all on function public.course_share_join_count(uuid) from public, anon;
grant execute on function public.course_share_join_count(uuid) to authenticated;
