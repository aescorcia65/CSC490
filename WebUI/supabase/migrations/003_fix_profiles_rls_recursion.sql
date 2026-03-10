-- Fix infinite recursion: the "Doctors and pharmacists can read patient profiles" policy
-- was querying profiles again to get the current user's role, which re-triggered RLS.
-- Use a SECURITY DEFINER function so we read the current user's role without going through RLS.

drop policy if exists "Doctors and pharmacists can read patient profiles" on public.profiles;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "Doctors and pharmacists can read patient profiles"
  on public.profiles for select
  using (
    role = 'patient'
    and public.current_user_role() in ('doctor', 'pharmacist')
  );
