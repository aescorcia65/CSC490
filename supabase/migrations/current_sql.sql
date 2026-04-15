-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  date date NOT NULL,
  time time without time zone NOT NULL,
  type text NOT NULL DEFAULT 'Follow-up'::text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'rescheduled'::text, 'cancelled'::text, 'completed'::text])),
  reschedule_request text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id),
  CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  pharmacist_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.doctor_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doctor_notes_pkey PRIMARY KEY (id),
  CONSTRAINT doctor_notes_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT doctor_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.doctor_patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doctor_patients_pkey PRIMARY KEY (id),
  CONSTRAINT doctor_patients_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT doctor_patients_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  type text NOT NULL DEFAULT 'general'::text,
  body text NOT NULL,
  rating integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.medication_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  medication_id uuid NOT NULL,
  taken_at timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  dose_index integer NOT NULL DEFAULT 0,
  CONSTRAINT medication_logs_pkey PRIMARY KEY (id),
  CONSTRAINT medication_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT medication_logs_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.user_medications(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['take_med'::text, 'prescription_ready'::text, 'refill_upcoming'::text, 'general'::text])),
  title text NOT NULL,
  body text,
  read_at timestamp with time zone,
  related_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.patient_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  body text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT patient_messages_pkey PRIMARY KEY (id),
  CONSTRAINT patient_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id),
  CONSTRAINT patient_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.pharmacy_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  doctor_name text,
  pharmacist_id uuid,
  pharmacist_name text,
  prescription_id uuid,
  patient_id uuid NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  reply_body text,
  reply_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pharmacy_messages_pkey PRIMARY KEY (id),
  CONSTRAINT pharmacy_messages_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT pharmacy_messages_pharmacist_id_fkey FOREIGN KEY (pharmacist_id) REFERENCES public.profiles(id),
  CONSTRAINT pharmacy_messages_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id),
  CONSTRAINT pharmacy_messages_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.prescription_medications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  instructions text,
  refill_reminder_days integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prescription_medications_pkey PRIMARY KEY (id),
  CONSTRAINT prescription_medications_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id)
);
CREATE TABLE public.prescription_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prescription_messages_pkey PRIMARY KEY (id),
  CONSTRAINT prescription_messages_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id),
  CONSTRAINT prescription_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.prescriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  pharmacist_id uuid,
  status text NOT NULL DEFAULT 'pending_pharmacist'::text CHECK (status = ANY (ARRAY['pending_pharmacist'::text, 'pending_fill'::text, 'ready'::text, 'filled'::text, 'picked_up'::text])),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prescriptions_pkey PRIMARY KEY (id),
  CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id),
  CONSTRAINT prescriptions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT prescriptions_pharmacist_id_fkey FOREIGN KEY (pharmacist_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  age integer,
  sex text,
  role text NOT NULL DEFAULT 'patient'::text CHECK (role = ANY (ARRAY['patient'::text, 'client'::text, 'doctor'::text, 'pharmacist'::text])),
  email text,
  notifications_enabled boolean DEFAULT true,
  onboarding_completed boolean DEFAULT false,
  dob text,
  blood_type text,
  weight text,
  height text,
  allergies ARRAY DEFAULT '{}'::text[],
  medical_conditions ARRAY DEFAULT '{}'::text[],
  emergency_contact jsonb,
  reminder_email text,
  primary_doctor_id uuid,
  primary_pharmacist_id uuid,
  specialty text,
  license_number text,
  pharmacy_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  onboarding_complete boolean DEFAULT false,
  care_team jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_primary_doctor_id_fkey FOREIGN KEY (primary_doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT profiles_primary_pharmacist_id_fkey FOREIGN KEY (primary_pharmacist_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_medications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  medication_name text NOT NULL,
  dosage text,
  freq text DEFAULT 'Once daily'::text,
  reminder_time text DEFAULT '08:00'::text,
  color text DEFAULT 'blue'::text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  times ARRAY,
  CONSTRAINT user_medications_pkey PRIMARY KEY (id),
  CONSTRAINT user_medications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.user_presence (
  user_id uuid NOT NULL,
  is_online boolean DEFAULT false,
  last_seen timestamp with time zone DEFAULT now(),
  CONSTRAINT user_presence_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);