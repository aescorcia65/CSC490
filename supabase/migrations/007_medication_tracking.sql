-- ============================================================
-- 007 – Medication adherence tracking
-- Creates a `medication_logs` table that records each take /
-- un‑take event, plus database functions the front‑end calls
-- to compute daily adherence, weekly history, and streaks.
-- ============================================================

-- ── 1. medication_logs table ─────────────────────────────────
-- One row per "taken" event. Deleting a row = un‑marking.
create table if not exists public.medication_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  medication_id uuid not null references public.user_medications (id) on delete cascade,
  taken_at      timestamptz not null default now(),
  -- scheduled_date lets us bucket by calendar day regardless of
  -- when the user actually tapped "taken" (handles midnight edge cases)
  scheduled_date date not null default current_date,
  created_at    timestamptz not null default now()
);

alter table public.medication_logs enable row level security;

-- Patients can only touch their own logs
create policy "Users can read own medication_logs"
  on public.medication_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own medication_logs"
  on public.medication_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own medication_logs"
  on public.medication_logs for delete
  using (auth.uid() = user_id);

-- Doctors can read their patients' logs (for the doctor portal)
create policy "Doctors can read patient medication_logs"
  on public.medication_logs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'doctor'
    )
  );

-- Indexes for the queries below
create index if not exists idx_medication_logs_user_date
  on public.medication_logs (user_id, scheduled_date);

create index if not exists idx_medication_logs_user_med_date
  on public.medication_logs (user_id, medication_id, scheduled_date);

-- Prevent duplicate logs for the same med + day
create unique index if not exists idx_medication_logs_unique_per_day
  on public.medication_logs (user_id, medication_id, scheduled_date);


-- ── 2. get_daily_adherence ───────────────────────────────────
-- Returns one row per date in a range with:
--   log_date, taken_count, total_count, adherence_pct
-- total_count = number of ACTIVE medications the user had on
-- that date (simplified: uses current active med count).
create or replace function public.get_daily_adherence(
  p_user_id uuid,
  p_start   date,
  p_end     date
)
returns table (
  log_date       date,
  taken_count    bigint,
  total_count    bigint,
  adherence_pct  integer
)
language sql stable security definer
as $$
  with dates as (
    select generate_series(p_start, p_end, '1 day'::interval)::date as d
  ),
  med_counts as (
    -- active medications the user currently has
    select count(*)::bigint as cnt
    from public.user_medications
    where user_id = p_user_id and active = true
  ),
  logs as (
    select scheduled_date, count(*)::bigint as taken
    from public.medication_logs
    where user_id = p_user_id
      and scheduled_date between p_start and p_end
    group by scheduled_date
  )
  select
    d.d                as log_date,
    coalesce(l.taken, 0)  as taken_count,
    mc.cnt                as total_count,
    case
      when mc.cnt = 0 then 0
      else least(round(coalesce(l.taken, 0)::numeric / mc.cnt * 100)::integer, 100)
    end                   as adherence_pct
  from dates d
  cross join med_counts mc
  left join logs l on l.scheduled_date = d.d
  order by d.d;
$$;


-- ── 3. get_adherence_streak ──────────────────────────────────
-- Returns the current streak of consecutive days where the
-- user took ALL their active medications (adherence = 100%).
-- Streak counts backward from yesterday (today is still in
-- progress, so it is not included).
create or replace function public.get_adherence_streak(
  p_user_id uuid
)
returns integer
language sql stable security definer
as $$
  with recursive med_count as (
    select count(*)::bigint as cnt
    from public.user_medications
    where user_id = p_user_id and active = true
  ),
  daily as (
    select
      ml.scheduled_date,
      count(*)::bigint as taken
    from public.medication_logs ml
    where ml.user_id = p_user_id
      and ml.scheduled_date < current_date   -- exclude today
    group by ml.scheduled_date
  ),
  perfect_days as (
    select d.scheduled_date
    from daily d, med_count mc
    where mc.cnt > 0 and d.taken >= mc.cnt
  ),
  -- Number the days backward from yesterday
  numbered as (
    select
      scheduled_date,
      (current_date - 1 - scheduled_date) as gap
    from perfect_days
  ),
  -- A consecutive run starting from gap=0
  streak as (
    select gap
    from numbered
    where gap = (
      select min(gap) from numbered
    )
    union all
    select n.gap
    from streak s
    join numbered n on n.gap = s.gap + 1
  )
  select coalesce(max(gap) + 1, 0)::integer from streak;
$$;


-- ── 4. get_medication_adherence ──────────────────────────────
-- Per-medication adherence over a date range.
-- Returns medication_id, medication_name, days_taken, total_days, adherence_pct
create or replace function public.get_medication_adherence(
  p_user_id uuid,
  p_start   date,
  p_end     date
)
returns table (
  medication_id   uuid,
  medication_name text,
  color           text,
  days_taken      bigint,
  total_days      bigint,
  adherence_pct   integer
)
language sql stable security definer
as $$
  with total as (
    select (p_end - p_start + 1)::bigint as days
  ),
  taken as (
    select
      ml.medication_id,
      count(distinct ml.scheduled_date)::bigint as cnt
    from public.medication_logs ml
    where ml.user_id = p_user_id
      and ml.scheduled_date between p_start and p_end
    group by ml.medication_id
  )
  select
    um.id              as medication_id,
    um.medication_name,
    um.color,
    coalesce(t.cnt, 0) as days_taken,
    tot.days            as total_days,
    case
      when tot.days = 0 then 0
      else least(round(coalesce(t.cnt, 0)::numeric / tot.days * 100)::integer, 100)
    end                 as adherence_pct
  from public.user_medications um
  cross join total tot
  left join taken t on t.medication_id = um.id
  where um.user_id = p_user_id and um.active = true
  order by um.medication_name;
$$;
