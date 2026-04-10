-- Multiple doctors per patient (primary care, specialists, etc.) with labels
-- care_team: [{"doctor_id": "<uuid>", "label": "Primary care"}, ...]
-- primary_doctor_id remains the canonical "primary" for workflows; synced from UI when a "Primary care" row exists

alter table public.profiles
  add column if not exists care_team jsonb not null default '[]'::jsonb;

comment on column public.profiles.care_team is 'Patient care team: JSON array of { doctor_id, label } for multiple doctors (specialties).';

-- Backfill from legacy primary_doctor_id when care_team is empty
update public.profiles
set care_team = jsonb_build_array(
  jsonb_build_object('doctor_id', primary_doctor_id::text, 'label', 'Primary care')
)
where primary_doctor_id is not null
  and jsonb_array_length(coalesce(care_team, '[]'::jsonb)) = 0;

-- Doctors can read patient profiles if listed in care_team (or legacy primary / prescriptions)
drop policy if exists "Doctors can read profiles of their patients only" on public.profiles;

create policy "Doctors can read profiles of their patients only"
  on public.profiles for select
  using (
    role = 'patient'
    and public.current_user_role() = 'doctor'
    and (
      primary_doctor_id = auth.uid()
      or id in (select patient_id from public.prescriptions where doctor_id = auth.uid())
      or exists (
        select 1
        from jsonb_array_elements(coalesce(care_team, '[]'::jsonb)) as el
        where coalesce(el->>'doctor_id', '') <> ''
          and (el->>'doctor_id')::uuid = auth.uid()
      )
    )
  );
