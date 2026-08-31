
-- Create site_milestones table
CREATE TABLE public.site_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.project_sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  priority text DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_milestones ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage all site_milestones"
ON public.site_milestones FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view site_milestones"
ON public.site_milestones FOR SELECT
TO authenticated
USING (true);

-- Timestamp trigger
CREATE TRIGGER update_site_milestones_updated_at
BEFORE UPDATE ON public.site_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add milestone_id to activity_events
ALTER TABLE public.activity_events
ADD COLUMN milestone_id uuid REFERENCES public.site_milestones(id) ON DELETE SET NULL;
