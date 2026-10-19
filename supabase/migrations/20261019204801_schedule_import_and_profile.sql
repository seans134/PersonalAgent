alter table public.user_profiles add column if not exists display_name text not null default '' check (length(display_name) <= 100);
alter table public.schedule_blocks add column if not exists effective_from date;
alter table public.schedule_blocks add column if not exists effective_until date;
alter table public.schedule_blocks add column if not exists end_day_offset smallint not null default 0;
alter table public.calendar_events add column if not exists end_day_offset smallint not null default 0;
alter table public.calendar_events add column if not exists timezone text;
alter table public.schedule_blocks drop constraint if exists schedule_blocks_check;
alter table public.calendar_events drop constraint if exists calendar_events_check;
alter table public.schedule_blocks add constraint schedule_blocks_duration_check check ((end_day_offset = 0 and end_time > start_time) or (end_day_offset = 1 and end_time <= start_time));
alter table public.calendar_events add constraint calendar_events_duration_check check ((end_day_offset = 0 and end_time > start_time) or (end_day_offset = 1 and end_time <= start_time));
alter table public.schedule_blocks add constraint schedule_blocks_dates_check check (effective_from is null or effective_until is null or effective_until >= effective_from);

-- Evaluate at most nine days around the first possible common occurrence, including overnight tails.
-- Date components deliberately use wall-clock arithmetic so DST does not move weekly shifts.
create or replace function public.schedule_items_overlap(a jsonb, b jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  with anchor as (
    select greatest(coalesce(nullif(a->>'date','')::date, nullif(a->>'effectiveFrom','')::date, '0001-01-02'::date),
                    coalesce(nullif(b->>'date','')::date, nullif(b->>'effectiveFrom','')::date, '0001-01-02'::date)) as d
  ), candidates as (
    select d + i as ad, d + i + j as bd from anchor cross join generate_series(-1,7) i cross join generate_series(-1,1) j
  )
  select exists(select 1 from candidates where
    (case when a->>'kind' = 'dated' then ad = (a->>'date')::date else
      (a->'daysOfWeek') @> to_jsonb(extract(dow from ad)::int) and
      ad >= coalesce(nullif(a->>'effectiveFrom','')::date, ad) and ad <= coalesce(nullif(a->>'effectiveUntil','')::date, ad) end)
    and (case when b->>'kind' = 'dated' then bd = (b->>'date')::date else
      (b->'daysOfWeek') @> to_jsonb(extract(dow from bd)::int) and
      bd >= coalesce(nullif(b->>'effectiveFrom','')::date, bd) and bd <= coalesce(nullif(b->>'effectiveUntil','')::date, bd) end)
    and ad + (a->>'startTime')::time < bd + (b->>'endTime')::time + coalesce((b->>'endDayOffset')::int,0) * interval '1 day'
    and bd + (b->>'startTime')::time < ad + (a->>'endTime')::time + coalesce((a->>'endDayOffset')::int,0) * interval '1 day');
$$;
revoke all on function public.schedule_items_overlap(jsonb,jsonb) from public, anon;
grant execute on function public.schedule_items_overlap(jsonb,jsonb) to authenticated;

create or replace function public.apply_schedule_import(entries jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  existing jsonb;
  days smallint[];
  starts time;
  ends time;
  offset_days int;
  first_date date;
  last_date date;
  event_day date;
  zone text;
  duplicate boolean;
  blocks_created int := 0;
  events_created int := 0;
  skipped int := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) not between 1 and 200 then raise exception 'Choose 1–200 entries'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select coalesce(timezone,'America/Toronto') into zone from public.user_profiles where user_id=owner_id;
  zone := coalesce(zone,'America/Toronto');
  for item in select value from jsonb_array_elements(entries) loop
    if item->>'kind' not in ('dated','recurring') or coalesce(length(trim(item->>'title')),0) not between 1 and 200
       or coalesce(item->>'category','') not in ('school','work','study','personal','unavailable') then raise exception 'Invalid schedule entry'; end if;
    if (item->>'timezone') is distinct from zone then raise exception 'Schedule timezone must match Profile'; end if;
    starts := (item->>'startTime')::time; ends := (item->>'endTime')::time;
    offset_days := coalesce((item->>'endDayOffset')::int,0);
    if starts is null or ends is null or offset_days not in (0,1) or starts = '24:00'::time or ends = '24:00'::time
      or not ((offset_days=0 and ends>starts) or (offset_days=1 and ends<=starts)) then raise exception 'Invalid shift duration'; end if;
    first_date := nullif(item->>'effectiveFrom','')::date;
    last_date := case when coalesce((item->>'ongoing')::boolean,false) then null else nullif(item->>'effectiveUntil','')::date end;
    event_day := nullif(item->>'date','')::date;
    select array_agg(distinct value::smallint order by value::smallint) into days from jsonb_array_elements_text(coalesce(item->'daysOfWeek','[]'::jsonb));
    if item->>'kind'='recurring' and (coalesce(cardinality(days),0)=0 or not days <@ array[0,1,2,3,4,5,6]::smallint[]
      or (not coalesce((item->>'ongoing')::boolean,false) and (first_date is null or last_date is null))
      or (first_date is not null and last_date is not null and last_date<first_date)) then raise exception 'Confirm weekdays and date range'; end if;
    if item->>'kind'='dated' and event_day is null then raise exception 'Confirm event date'; end if;
    duplicate := false;
    if item->>'kind'='recurring' then
      select exists(select 1 from public.schedule_blocks s where s.user_id=owner_id and lower(trim(s.title))=lower(trim(item->>'title'))
        and s.category=item->>'category' and s.days_of_week @> days and s.days_of_week <@ days and s.start_time=starts and s.end_time=ends
        and s.end_day_offset=offset_days and s.effective_from is not distinct from first_date and s.effective_until is not distinct from last_date and s.timezone=zone) into duplicate;
    else
      select exists(select 1 from public.calendar_events e where e.user_id=owner_id and lower(trim(e.title))=lower(trim(item->>'title'))
        and e.category=item->>'category' and e.event_date=event_day and e.start_time=starts and e.end_time=ends and e.end_day_offset=offset_days
        and coalesce(e.timezone,zone)=zone) into duplicate;
    end if;
    if duplicate then skipped := skipped+1; continue; end if;
    item := item || jsonb_build_object('effectiveUntil',last_date);
    if not coalesce((item->>'allowOverlap')::boolean,false) then
      for existing in
        select jsonb_build_object('kind','recurring','daysOfWeek',s.days_of_week,'startTime',s.start_time,'endTime',s.end_time,'endDayOffset',s.end_day_offset,'effectiveFrom',s.effective_from,'effectiveUntil',s.effective_until) from public.schedule_blocks s where s.user_id=owner_id
        union all
        select jsonb_build_object('kind','dated','date',e.event_date,'startTime',e.start_time,'endTime',e.end_time,'endDayOffset',e.end_day_offset) from public.calendar_events e where e.user_id=owner_id
        union all
        select jsonb_build_object('kind','dated','date',(c.due_at at time zone zone)::date,'startTime',(c.due_at at time zone zone)::time,'endTime',(coalesce(c.end_at,c.due_at + case when c.kind='exam' then interval '2 hours' else interval '1 hour' end) at time zone zone)::time,'endDayOffset',case when (coalesce(c.end_at,c.due_at + case when c.kind='exam' then interval '2 hours' else interval '1 hour' end) at time zone zone)::date > (c.due_at at time zone zone)::date then 1 else 0 end)
        from public.course_items c join public.courses co on co.id=c.course_id where c.user_id=owner_id and co.archived_at is null and c.kind in ('exam','quiz')
      loop
        if public.schedule_items_overlap(item,existing) then raise exception 'Schedule overlap found. Review the preview and explicitly allow overlaps to keep both.'; end if;
      end loop;
    end if;
    if item->>'kind'='recurring' then
      insert into public.schedule_blocks(user_id,title,category,days_of_week,start_time,end_time,timezone,effective_from,effective_until,end_day_offset)
      values(owner_id,trim(item->>'title'),item->>'category',days,starts,ends,zone,first_date,last_date,offset_days);
      blocks_created := blocks_created+1;
    else
      insert into public.calendar_events(user_id,title,category,event_date,start_time,end_time,timezone,end_day_offset)
      values(owner_id,trim(item->>'title'),item->>'category',event_day,starts,ends,zone,offset_days);
      events_created := events_created+1;
    end if;
  end loop;
  insert into public.user_profiles(user_id,has_school_schedule,has_work_schedule)
  values(owner_id,exists(select 1 from jsonb_array_elements(entries) e where e->>'category'='school'),exists(select 1 from jsonb_array_elements(entries) e where e->>'category'='work'))
  on conflict (user_id) do update set has_school_schedule=public.user_profiles.has_school_schedule or excluded.has_school_schedule, has_work_schedule=public.user_profiles.has_work_schedule or excluded.has_work_schedule;
  return jsonb_build_object('scheduleBlocksCreated',blocks_created,'eventsCreated',events_created,'skippedDuplicates',skipped);
end;
$$;
revoke all on function public.apply_schedule_import(jsonb) from public, anon;
grant execute on function public.apply_schedule_import(jsonb) to authenticated;
