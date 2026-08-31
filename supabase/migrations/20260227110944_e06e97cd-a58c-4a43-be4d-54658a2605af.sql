
-- Add missing columns to activity_events for the Activities module
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_lat numeric,
  ADD COLUMN IF NOT EXISTS location_lng numeric,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_hours numeric DEFAULT 0;

-- Add RLS policy for managers to view subordinate activities
CREATE POLICY "Managers can view subordinate activities"
  ON public.activity_events
  FOR SELECT
  USING (
    user_id IN (SELECT sub.user_id FROM public.get_subordinate_users(auth.uid()) sub)
  );

-- Users can update own activities
CREATE POLICY "Users can update own activities"
  ON public.activity_events
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete own activities
CREATE POLICY "Users can delete own activities"
  ON public.activity_events
  FOR DELETE
  USING (user_id = auth.uid());
