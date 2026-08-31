ALTER TABLE public.customer_activities
  ADD COLUMN IF NOT EXISTS outcome text;