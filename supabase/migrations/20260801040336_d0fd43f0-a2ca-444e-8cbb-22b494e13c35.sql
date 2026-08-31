ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome text;

CREATE INDEX IF NOT EXISTS idx_activity_events_lead_id ON public.activity_events(lead_id);