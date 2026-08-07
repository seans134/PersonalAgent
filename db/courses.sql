-- Atlas Courses: courses, weighted categories, graded items (assignment/quiz/exam)

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  code text,
  color text,
  term text,
  target_grade numeric check (target_grade is null or (target_grade >= 0 and target_grade <= 100)),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists courses_user_idx on public.courses (user_id, archived_at);

create table if not exists public.course_categories (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists course_categories_course_idx on public.course_categories (course_id, position);

create table if not exists public.course_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  category_id uuid references public.course_categories (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('assignment', 'quiz', 'exam')),
  title text not null,
  due_at timestamptz not null,
  end_at timestamptz,
  location text,
  score_earned numeric,
  score_max numeric not null default 100 check (score_max > 0),
  estimated_effort_hours numeric check (estimated_effort_hours is null or estimated_effort_hours >= 0),
  focus_mode text not null default 'continuous' check (focus_mode in ('finish_first', 'continuous', 'deferred')),
  created_at timestamptz not null default now(),
  check (end_at is null or end_at >= due_at)
);

create index if not exists course_items_course_idx on public.course_items (course_id);
create index if not exists course_items_user_due_idx on public.course_items (user_id, due_at);

alter table public.courses enable row level security;
alter table public.course_categories enable row level security;
alter table public.course_items enable row level security;

drop policy if exists "Users read own courses" on public.courses;
create policy "Users read own courses" on public.courses
for select using (auth.uid() = user_id);
drop policy if exists "Users write own courses" on public.courses;
create policy "Users write own courses" on public.courses
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own course categories" on public.course_categories;
create policy "Users read own course categories" on public.course_categories
for select using (auth.uid() = user_id);
drop policy if exists "Users write own course categories" on public.course_categories;
create policy "Users write own course categories" on public.course_categories
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own course items" on public.course_items;
create policy "Users read own course items" on public.course_items
for select using (auth.uid() = user_id);
drop policy if exists "Users write own course items" on public.course_items;
create policy "Users write own course items" on public.course_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
