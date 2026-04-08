-- Add role and email to profiles (patient | doctor | pharmacist)
alter table public.profiles
  add column if not exists role text not null default 'patient'
  check (role in ('patient', 'doctor', 'pharmacist'));

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists notifications_enabled boolean default true;

-- Prescriptions: links patient, doctor, pharmacist; status drives workflow
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  doctor_id uuid not null references public.profiles (id) on delete restrict,
  pharmacist_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending_pharmacist'
    check (status in ('pending_pharmacist', 'pending_fill', 'ready', 'filled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Medications (line items) per prescription
create table if not exists public.prescription_medications (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  medication_name text not null,
  dosage text,
  frequency text,
  instructions text,
  refill_reminder_days int,
  created_at timestamptz default now()
);

-- Notifications for take reminders, prescription ready, refill upcoming
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('take_med', 'prescription_ready', 'refill_upcoming', 'general')),
  title text not null,
  body text,
  read_at timestamptz,
  related_id uuid,
  created_at timestamptz default now()
);

-- RLS: prescriptions
alter table public.prescriptions enable row level security;

create policy "Patient can read own prescriptions"
  on public.prescriptions for select
  using (auth.uid() = patient_id);

create policy "Doctor can read prescriptions they created"
  on public.prescriptions for select
  using (auth.uid() = doctor_id);

create policy "Doctor can insert prescriptions (as doctor)"
  on public.prescriptions for insert
  with check (auth.uid() = doctor_id);

create policy "Pharmacist can read pending or assigned to them"
  on public.prescriptions for select
  using (
    pharmacist_id = auth.uid()
    or (pharmacist_id is null and status = 'pending_pharmacist')
  );

create policy "Pharmacist can update when assigned or claiming"
  on public.prescriptions for update
  using (
    pharmacist_id = auth.uid()
    or (pharmacist_id is null and status = 'pending_pharmacist')
  );

-- RLS: prescription_medications (same visibility as parent prescription)
alter table public.prescription_medications enable row level security;

create policy "Read via prescription access"
  on public.prescription_medications for select
  using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_id
      and (p.patient_id = auth.uid() or p.doctor_id = auth.uid() or p.pharmacist_id = auth.uid()
           or (p.pharmacist_id is null and p.status = 'pending_pharmacist'))
    )
  );

create policy "Doctor can insert medications for own prescriptions"
  on public.prescription_medications for insert
  with check (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_id and p.doctor_id = auth.uid()
    )
  );

-- RLS: notifications
alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications (e.g. mark read)"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "Insert notifications for any user (system / pharmacist / doctor)"
  on public.notifications for insert
  with check (true);

-- Doctors and pharmacists can read patient profiles (for prescription lookup).
-- Use a SECURITY DEFINER function to avoid RLS recursion (policy can't query profiles again).
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

-- Indexes
create index if not exists idx_prescriptions_patient on public.prescriptions (patient_id);
create index if not exists idx_prescriptions_doctor on public.prescriptions (doctor_id);
create index if not exists idx_prescriptions_pharmacist on public.prescriptions (pharmacist_id);
create index if not exists idx_prescriptions_status on public.prescriptions (status);
create index if not exists idx_notifications_user on public.notifications (user_id);
