-- ============================================================
-- 008 – Analytics: RLS for upserts, streak fix, RPC grants
-- ============================================================

-- PostgREST upsert (ON CONFLICT DO UPDATE) requires UPDATE under RLS.
drop policy if exists "Users can update own medication_logs" on public.medication_logs;
create policy "Users can update own medication_logs"
  on public.medication_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Replace streak: count consecutive calendar days ending at yesterday where
-- the user logged every active medication (same rule as 007 intent).
create or replace function public.get_adherence_streak(
  p_user_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mc bigint;
  d date;
  taken_count bigint;
  streak int := 0;
begin
  select count(*)::bigint into mc
  from public.user_medications
  where user_id = p_user_id and coalesce(active, true) = true;

  if mc is null or mc = 0 then
    return 0;
  end if;

  d := current_date - 1;

  loop
    select count(*)::bigint into taken_count
    from public.medication_logs
    where user_id = p_user_id
      and scheduled_date = d;

    exit when taken_count < mc;
    streak := streak + 1;
    d := d - 1;
    exit when streak > 730;
  end loop;

  return streak;
end;
$$;

grant execute on function public.get_daily_adherence(uuid, date, date) to authenticated;
grant execute on function public.get_adherence_streak(uuid) to authenticated;
grant execute on function public.get_medication_adherence(uuid, date, date) to authenticated;
