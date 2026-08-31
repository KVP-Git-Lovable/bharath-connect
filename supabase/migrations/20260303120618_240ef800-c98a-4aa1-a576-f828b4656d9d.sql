
-- 1. Create project_sites table
CREATE TABLE public.project_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL,
  site_code TEXT GENERATED ALWAYS AS ('SITE-' || substr(id::text, 1, 6)) STORED,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_site_name UNIQUE (site_name)
);

-- Enable RLS
ALTER TABLE public.project_sites ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage all
CREATE POLICY "Admins can manage all project_sites"
ON public.project_sites FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Authenticated can view all (including inactive for historical joins)
CREATE POLICY "Authenticated can view project_sites"
ON public.project_sites FOR SELECT
TO authenticated
USING (true);

-- RLS: Authenticated can insert project_sites
CREATE POLICY "Authenticated can insert project_sites"
ON public.project_sites FOR INSERT
TO authenticated
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_project_sites_updated_at
BEFORE UPDATE ON public.project_sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add site_id column to activity_events
ALTER TABLE public.activity_events
ADD COLUMN site_id UUID REFERENCES public.project_sites(id);
