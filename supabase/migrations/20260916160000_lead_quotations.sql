-- One Lead can have several quotations over time (the sales team's
-- "Format C - Enquiry Followup Register"). Each row of that register
-- becomes one row here, attached to a Lead matched by company name.
CREATE TABLE IF NOT EXISTS public.lead_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  enquiry_number text,
  enquiry_received_date date,
  quotation_number text,
  quotation_date date,
  value_without_gst numeric,
  followed_by_user_id uuid REFERENCES auth.users(id),
  followed_by_name text,
  status_id uuid REFERENCES public.master_lead_statuses(id),
  status_name text,
  po_date date,
  po_number text,
  po_amount numeric,
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_quotations_lead_id ON public.lead_quotations(lead_id);

ALTER TABLE public.lead_quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_quotations select accessible" ON public.lead_quotations;
CREATE POLICY "lead_quotations select accessible" ON public.lead_quotations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_quotations.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
);

DROP POLICY IF EXISTS "lead_quotations insert accessible" ON public.lead_quotations;
CREATE POLICY "lead_quotations insert accessible" ON public.lead_quotations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_quotations.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
);

DROP POLICY IF EXISTS "lead_quotations update accessible" ON public.lead_quotations;
CREATE POLICY "lead_quotations update accessible" ON public.lead_quotations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_quotations.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_quotations.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
);

DROP POLICY IF EXISTS "lead_quotations delete accessible" ON public.lead_quotations;
CREATE POLICY "lead_quotations delete accessible" ON public.lead_quotations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_quotations.lead_id
      AND public.can_access_crm_record(l.owner_id, l.created_by)
  )
);

DROP TRIGGER IF EXISTS update_lead_quotations_updated_at ON public.lead_quotations;
CREATE TRIGGER update_lead_quotations_updated_at BEFORE UPDATE ON public.lead_quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
