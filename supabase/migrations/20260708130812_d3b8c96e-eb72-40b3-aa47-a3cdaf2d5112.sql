
ALTER TABLE public.activity_events 
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.customer_opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activity_events_customer ON public.activity_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_opportunity ON public.activity_events(opportunity_id);
