
CREATE TABLE public.master_uom (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uom_name TEXT NOT NULL,
  short_code TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_uom TO authenticated;
GRANT ALL ON public.master_uom TO service_role;

ALTER TABLE public.master_uom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view UOMs"
  ON public.master_uom FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert UOMs"
  ON public.master_uom FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update UOMs"
  ON public.master_uom FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete UOMs"
  ON public.master_uom FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_master_uom_updated_at
  BEFORE UPDATE ON public.master_uom
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.master_uom (uom_name, short_code, sort_order) VALUES
  ('Numbers', 'Nos', 1),
  ('Kilograms', 'Kg', 2),
  ('Tons', 'Ton', 3),
  ('Bags', 'Bags', 4),
  ('Square Feet', 'Sqft', 5),
  ('Running Meter', 'Rmt', 6),
  ('Set', 'Set', 7)
ON CONFLICT (short_code) DO NOTHING;
