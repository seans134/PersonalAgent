alter table public.goals
add column if not exists task_type text not null default 'general';

alter table public.goals
add column if not exists minimum_daily_minutes integer not null default 0;

update public.goals
set task_type = 'general'
where task_type is null
  or task_type not in ('general', 'focus', 'fitness', 'wellness', 'admin', 'exercise', 'wellbeing');

update public.goals
set task_type = 'fitness'
where task_type = 'exercise';

update public.goals
set task_type = 'wellness'
where task_type = 'wellbeing';

update public.goals
set minimum_daily_minutes = least(720, greatest(0, coalesce(minimum_daily_minutes, 0)));

alter table public.goals
alter column task_type set default 'general';

alter table public.goals
alter column task_type set not null;

alter table public.goals
alter column minimum_daily_minutes set default 0;

alter table public.goals
alter column minimum_daily_minutes set not null;

alter table public.goals
drop constraint if exists goals_task_type_check;

alter table public.goals
add constraint goals_task_type_check
check (task_type in ('general', 'focus', 'fitness', 'wellness', 'admin'));

alter table public.goals
drop constraint if exists goals_minimum_daily_minutes_check;

alter table public.goals
add constraint goals_minimum_daily_minutes_check
check (minimum_daily_minutes between 0 and 720);
