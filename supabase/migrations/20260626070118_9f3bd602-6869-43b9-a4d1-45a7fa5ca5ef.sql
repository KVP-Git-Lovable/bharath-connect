CREATE TABLE public.procurement_vendor_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grn_id uuid NOT NULL REFERENCES public.procurement_grns(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  po_id uuid,
  delivery_timeliness integer NOT NULL CHECK (delivery_timeliness BETWEEN 1 AND 5),
  material_quality integer NOT NULL CHECK (material_quality BETWEEN 1 AND 5),
  quantity_accuracy integer NOT NULL CHECK (quantity_accuracy BETWEEN 1 AND 5),
  overall_experience integer NOT NULL CHECK (overall_experience BETWEEN 1 AND 5),
  comments text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grn_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_vendor_feedback TO authenticated;
GRANT ALL ON public.procurement_vendor_feedback TO service_role;

ALTER TABLE public.procurement_vendor_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view vendor feedback"
  ON public.procurement_vendor_feedback FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert vendor feedback"
  ON public.procurement_vendor_feedback FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update vendor feedback"
  ON public.procurement_vendor_feedback FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete vendor feedback"
  ON public.procurement_vendor_feedback FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_procurement_vendor_feedback_updated_at
  BEFORE UPDATE ON public.procurement_vendor_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();