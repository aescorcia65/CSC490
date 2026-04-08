-- Ensure new auth users get email in profiles (extend handle_new_user from 001)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Onboarding: show profile form until user completes it
alter table public.profiles
  add column if not exists onboarding_completed boolean default false;

-- Existing users with a name are considered onboarded
update public.profiles
  set onboarding_completed = true
  where (first_name is not null and trim(first_name) <> '') and (onboarding_completed is null or onboarding_completed = false);

-- Extend profiles for health profile, emergency contact, and reminder email
alter table public.profiles
  add column if not exists dob text,
  add column if not exists blood_type text,
  add column if not exists weight text,
  add column if not exists height text,
  add column if not exists allergies text[] default '{}',
  add column if not exists medical_conditions text[] default '{}',
  add column if not exists emergency_contact jsonb,
  add column if not exists reminder_email text;

-- User medications (patient's personal med list; not from prescriptions)
create table if not exists public.user_medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  medication_name text not null,
  dosage text,
  freq text default 'Once daily',
  reminder_time text default '08:00',
  color text default 'blue',
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.user_medications enable row level security;

create policy "Users can read own medications"
  on public.user_medications for select
  using (auth.uid() = user_id);

create policy "Users can insert own medications"
  on public.user_medications for insert
  with check (auth.uid() = user_id);

create policy "Users can update own medications"
  on public.user_medications for update
  using (auth.uid() = user_id);

create policy "Users can delete own medications"
  on public.user_medications for delete
  using (auth.uid() = user_id);

create index if not exists idx_user_medications_user on public.user_medications (user_id);

-- Chats (AI health advisor history)
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  response text not null,
  created_at timestamptz default now()
);

alter table public.chats enable row level security;

create policy "Users can read own chats"
  on public.chats for select
  using (auth.uid() = user_id);

create policy "Users can insert own chats"
  on public.chats for insert
  with check (auth.uid() = user_id);

create index if not exists idx_chats_user on public.chats (user_id);

-- Feedback
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  user_email text,
  type text not null default 'general',
  body text not null,
  rating int default 5,
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

create policy "Anyone can insert feedback"
  on public.feedback for insert
  with check (true);

create policy "Users can read own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

create index if not exists idx_feedback_created on public.feedback (created_at);

-- Doctor notes (doctor-patient)
create table if not exists public.doctor_notes (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  created_at timestamptz default now()
);

alter table public.doctor_notes enable row level security;

create policy "Doctors can read own notes"
  on public.doctor_notes for select
  using (auth.uid() = doctor_id);

create policy "Doctors can insert own notes"
  on public.doctor_notes for insert
  with check (auth.uid() = doctor_id);

create index if not exists idx_doctor_notes_doctor_patient on public.doctor_notes (doctor_id, patient_id);

-- Pharmacist notes (pharmacist-patient, with refill status)
create table if not exists public.pharmacist_notes (
  id uuid primary key default gen_random_uuid(),
  pharmacist_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  note text not null,
  refill_status text default 'pending' check (refill_status in ('pending', 'approved', 'dispensed', 'denied')),
  created_at timestamptz default now()
);

alter table public.pharmacist_notes enable row level security;

create policy "Pharmacists can read own notes"
  on public.pharmacist_notes for select
  using (auth.uid() = pharmacist_id);

create policy "Pharmacists can insert own notes"
  on public.pharmacist_notes for insert
  with check (auth.uid() = pharmacist_id);

create index if not exists idx_pharmacist_notes_pharmacist_patient on public.pharmacist_notes (pharmacist_id, patient_id);

-- Index for listing patients (profiles where role = patient)
create index if not exists idx_profiles_role on public.profiles (role);
