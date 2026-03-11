-- Patient primary care: assign primary doctor and primary pharmacist
-- Doctors see their patients and can prescribe; prescriptions go to patient's primary pharmacist
-- Pharmacist fulfills and marks ready; patient gets notified

-- 1. Add primary doctor and primary pharmacist to profiles (patients only use these)
alter table public.profiles
  add column if not exists primary_doctor_id uuid references public.profiles (id) on delete set null,
  add column if not exists primary_pharmacist_id uuid references public.profiles (id) on delete set null;

comment on column public.profiles.primary_doctor_id is 'Patient’s assigned primary doctor (must be role=doctor)';
comment on column public.profiles.primary_pharmacist_id is 'Patient’s assigned primary pharmacist (must be role=pharmacist)';

-- 2. Validate that primary_doctor_id / primary_pharmacist_id reference the correct role (trigger)
create or replace function public.validate_primary_care_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_role text;
begin
  if new.primary_doctor_id is not null then
    select role into ref_role from public.profiles where id = new.primary_doctor_id;
    if ref_role is null or ref_role <> 'doctor' then
      raise exception 'primary_doctor_id must reference a profile with role=doctor';
    end if;
  end if;
  if new.primary_pharmacist_id is not null then
    select role into ref_role from public.profiles where id = new.primary_pharmacist_id;
    if ref_role is null or ref_role <> 'pharmacist' then
      raise exception 'primary_pharmacist_id must reference a profile with role=pharmacist';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_primary_care_on_profiles on public.profiles;
create trigger validate_primary_care_on_profiles
  before insert or update of primary_doctor_id, primary_pharmacist_id
  on public.profiles
  for each row
  execute function public.validate_primary_care_ids();

-- 3. RLS: patients can read doctor and pharmacist profiles (to list and assign primary)
create policy "Patients can read doctor and pharmacist profiles"
  on public.profiles for select
  using (
    public.current_user_role() = 'patient'
    and role in ('doctor', 'pharmacist')
  );

-- 4. When a prescription is marked ready or filled, notify the patient
create or replace function public.notify_patient_prescription_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('ready', 'filled') and (old.status is distinct from new.status) then
    insert into public.notifications (user_id, type, title, body, related_id)
    values (
      new.patient_id,
      'prescription_ready',
      'Prescription ready for pickup',
      'Your prescription has been fulfilled and is ready for pickup.',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_prescription_ready_notify on public.prescriptions;
create trigger on_prescription_ready_notify
  after update of status on public.prescriptions
  for each row
  execute function public.notify_patient_prescription_ready();

-- 5. Indexes for listing patients by doctor and for primary care lookups
create index if not exists idx_profiles_primary_doctor on public.profiles (primary_doctor_id)
  where primary_doctor_id is not null;
create index if not exists idx_profiles_primary_pharmacist on public.profiles (primary_pharmacist_id)
  where primary_pharmacist_id is not null;

-- 6. Restrict doctor access: doctors see only their patients (assigned as primary or with existing prescription)
--    Drop the broad "Doctors and pharmacists can read patient profiles" and replace with role-specific rules.
drop policy if exists "Doctors and pharmacists can read patient profiles" on public.profiles;

create policy "Doctors can read profiles of their patients only"
  on public.profiles for select
  using (
    role = 'patient'
    and public.current_user_role() = 'doctor'
    and (
      primary_doctor_id = auth.uid()
      or id in (select patient_id from public.prescriptions where doctor_id = auth.uid())
    )
  );

create policy "Pharmacists can read patient profiles"
  on public.profiles for select
  using (
    role = 'patient'
    and public.current_user_role() = 'pharmacist'
  );
