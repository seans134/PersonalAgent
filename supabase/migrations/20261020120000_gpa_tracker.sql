-- Atlas GPA tracker: course credits, an official final letter grade for finished courses, and the
-- student's GPA scale. GPA math lives in packages/core/src/grades/gpa.ts.

-- Credits a course is worth (null = not set; such courses are left out of GPA and listed as such).
alter table public.courses
  add column if not exists credits numeric check (credits is null or (credits >= 0 and credits <= 20));

-- The official final grade from the transcript, stored as a letter: transcripts record letters, GPA
-- is defined on letters, and schools' percent cutoffs differ, so a stored percent would have to be
-- re-mapped through cutoffs that may not match the student's school. When null, GPA uses the course's
-- current computed grade and marks it in progress. Keep this list in sync with LETTER_GRADES in gpa.ts.
alter table public.courses
  add column if not exists final_grade_override text check (
    final_grade_override is null
    or final_grade_override in ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')
  );

-- Grade-point scale (GPA_SCALES in gpa.ts). Adding a scale there means widening this check.
alter table public.user_profiles
  add column if not exists gpa_scale text not null default 'us_4_0' check (gpa_scale in ('us_4_0', 'us_4_3'));

-- Joining a shared course now copies its credits (same course, same credit weight). Scores, target
-- and final grade stay private as before. Otherwise identical to 20261019235900_course_shares.sql.
create or replace function public.join_course_share(share_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  shared record;
  item_total integer;
  joined_id uuid;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select s.id as share_id, s.user_id as owner_id, c.id as course_id, c.name, c.code, c.term, c.credits
  into shared
  from public.course_shares s
  join public.courses c on c.id = s.course_id and c.user_id = s.user_id
  where s.token = share_token and s.revoked_at is null and c.archived_at is null;
  if not found then
    return null;
  end if;

  select count(*)::integer into item_total
  from public.course_items i where i.course_id = shared.course_id and i.user_id = shared.owner_id;

  if shared.owner_id = caller then
    return jsonb_build_object('courseId', shared.course_id, 'created', false, 'itemCount', item_total);
  end if;

  insert into public.courses (user_id, name, code, term, credits, joined_from_share_id)
  values (caller, shared.name, shared.code, shared.term, shared.credits, shared.share_id)
  on conflict (user_id, joined_from_share_id) where joined_from_share_id is not null do nothing
  returning id into joined_id;

  if joined_id is null then
    select c.id into joined_id
    from public.courses c where c.user_id = caller and c.joined_from_share_id = shared.share_id;
    return jsonb_build_object('courseId', joined_id, 'created', false, 'itemCount', item_total);
  end if;

  with src as (
    select cc.id as old_id, cc.name, cc.weight,
      (row_number() over (order by cc.position, cc.created_at, cc.id) - 1)::integer as pos
    from public.course_categories cc
    where cc.course_id = shared.course_id and cc.user_id = shared.owner_id
  ),
  copied as (
    insert into public.course_categories (course_id, user_id, name, weight, position)
    select joined_id, caller, src.name, src.weight, src.pos from src
    returning id, position
  )
  insert into public.course_items
    (course_id, category_id, user_id, kind, title, due_at, end_at, score_max, estimated_effort_hours)
  select joined_id, copied.id, caller, i.kind, i.title, i.due_at, i.end_at, i.score_max, i.estimated_effort_hours
  from public.course_items i
  left join src on src.old_id = i.category_id
  left join copied on copied.position = src.pos
  where i.course_id = shared.course_id and i.user_id = shared.owner_id;

  return jsonb_build_object('courseId', joined_id, 'created', true, 'itemCount', item_total);
end;
$$;

revoke all on function public.join_course_share(text) from public, anon;
grant execute on function public.join_course_share(text) to authenticated;
