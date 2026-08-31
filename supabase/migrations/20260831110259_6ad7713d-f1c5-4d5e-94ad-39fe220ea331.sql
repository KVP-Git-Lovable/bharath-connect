ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS travel_distance_km numeric,
  ADD COLUMN IF NOT EXISTS travel_time_mins numeric,
  ADD COLUMN IF NOT EXISTS travel_from_type text,
  ADD COLUMN IF NOT EXISTS travel_from_activity_id uuid,
  ADD COLUMN IF NOT EXISTS travel_from_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_distance_km numeric,
  ADD COLUMN IF NOT EXISTS manual_distance_note text,
  ADD COLUMN IF NOT EXISTS manual_distance_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.list_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'leads',
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  filter_match text NOT NULL DEFAULT 'all',
  display_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_by text,
  sort_direction text NOT NULL DEFAULT 'desc',
  visibility text NOT NULL DEFAULT 'private',
  shared_with jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  charts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_views TO authenticated;
GRANT ALL ON public.list_views TO service_role;

ALTER TABLE public.list_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own and shared list views" ON public.list_views;
CREATE POLICY "Users can view own and shared list views"
  ON public.list_views FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'selected' AND shared_with ? auth.uid()::text)
  );

DROP POLICY IF EXISTS "Users can create own list views" ON public.list_views;
CREATE POLICY "Users can create own list views"
  ON public.list_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own list views" ON public.list_views;
CREATE POLICY "Users can update own list views"
  ON public.list_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own list views" ON public.list_views;
CREATE POLICY "Users can delete own list views"
  ON public.list_views FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_list_views_user_section ON public.list_views(user_id, section);

DROP TRIGGER IF EXISTS trg_list_views_updated_at ON public.list_views;
CREATE TRIGGER trg_list_views_updated_at
  BEFORE UPDATE ON public.list_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();