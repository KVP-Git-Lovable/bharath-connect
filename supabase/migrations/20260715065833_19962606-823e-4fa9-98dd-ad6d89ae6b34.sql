
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS target_first_contact_date date,
  ADD COLUMN IF NOT EXISTS actual_first_contact_date date,
  ADD COLUMN IF NOT EXISTS target_conversion_date date;
