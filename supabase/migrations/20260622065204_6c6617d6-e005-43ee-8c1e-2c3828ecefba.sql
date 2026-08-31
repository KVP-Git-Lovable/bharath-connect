ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS estimated_budget numeric,
  ADD COLUMN IF NOT EXISTS bill_to text,
  ADD COLUMN IF NOT EXISTS ship_to text;