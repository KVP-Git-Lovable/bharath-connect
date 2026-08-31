ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS opportunity_value numeric,
  ADD COLUMN IF NOT EXISTS opportunity_close_date date,
  ADD COLUMN IF NOT EXISTS opportunity_probability integer;