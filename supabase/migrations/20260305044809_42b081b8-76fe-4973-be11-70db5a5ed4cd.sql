
-- Create site_assignments table for multi-user site visibility
CREATE TABLE public.site_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.project_sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID,
  UNIQUE(site_id, user_id)
);

-- Enable RLS
ALTER TABLE public.site_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all assignments
CREATE POLICY "Admins can manage all site_assignments"
  ON public.site_assignments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own assignments
CREATE POLICY "Users can view own site_assignments"
  ON public.site_assignments FOR SELECT
  USING (user_id = auth.uid());

-- Authenticated can insert (for creator auto-assign)
CREATE POLICY "Authenticated can insert site_assignments"
  ON public.site_assignments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Drop old permissive SELECT policy on project_sites
DROP POLICY IF EXISTS "Authenticated can view project_sites" ON public.project_sites;

-- New: users can see sites they are assigned to
CREATE POLICY "Users can view assigned sites"
  ON public.project_sites FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.site_assignments sa
      WHERE sa.site_id = project_sites.id AND sa.user_id = auth.uid()
    )
  );
