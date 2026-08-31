
ALTER TABLE public.site_milestones
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.site_milestones(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS at_risk boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_site_milestones_parent_id ON public.site_milestones(parent_id);

CREATE TABLE IF NOT EXISTS public.site_milestone_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.site_milestones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smc_milestone_id ON public.site_milestone_comments(milestone_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_milestone_comments TO authenticated;
GRANT ALL ON public.site_milestone_comments TO service_role;

ALTER TABLE public.site_milestone_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view milestone comments"
  ON public.site_milestone_comments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can insert own milestone comments"
  ON public.site_milestone_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own milestone comments"
  ON public.site_milestone_comments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own milestone comments"
  ON public.site_milestone_comments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_smc_updated_at ON public.site_milestone_comments;
CREATE TRIGGER update_smc_updated_at
  BEFORE UPDATE ON public.site_milestone_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
