
CREATE TABLE public.activity_types_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_types_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view activity types"
ON public.activity_types_master FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert activity types"
ON public.activity_types_master FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can update activity types"
ON public.activity_types_master FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete activity types"
ON public.activity_types_master FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed with existing hardcoded types
INSERT INTO public.activity_types_master (name) VALUES
  ('Site Visit'),
  ('Contractor Meeting'),
  ('Material Inspection'),
  ('Client Meeting'),
  ('Survey Work'),
  ('Office Work'),
  ('Travel'),
  ('Training'),
  ('Other');
