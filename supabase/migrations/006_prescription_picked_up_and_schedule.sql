-- Pharmacist can mark prescription as picked up; when marked, add medications to patient's schedule (user_medications)

-- 1. Allow status 'picked_up' on prescriptions
alter table public.prescriptions
  drop constraint if exists prescriptions_status_check;

alter table public.prescriptions
  add constraint prescriptions_status_check
  check (status in ('pending_pharmacist', 'pending_fill', 'ready', 'filled', 'picked_up'));

-- 2. When a prescription is marked as picked_up, copy each prescription_medication into the patient's user_medications (medication schedule)
create or replace function public.add_prescription_to_patient_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'picked_up' and (old.status is null or old.status is distinct from 'picked_up') then
    insert into public.user_medications (user_id, medication_name, dosage, freq, reminder_time, color, active)
    select
      new.patient_id,
      pm.medication_name,
      pm.dosage,
      coalesce(nullif(trim(pm.frequency), ''), 'Once daily'),
      '08:00',
      'blue',
      true
    from public.prescription_medications pm
    where pm.prescription_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_prescription_picked_up_add_to_schedule on public.prescriptions;
create trigger on_prescription_picked_up_add_to_schedule
  after update of status on public.prescriptions
  for each row
  execute function public.add_prescription_to_patient_schedule();
