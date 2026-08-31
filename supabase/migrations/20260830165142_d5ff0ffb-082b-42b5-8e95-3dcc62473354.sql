CREATE TABLE public.list_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  filter_match text NOT NULL DEFAULT 'all',
  display_fields text[] NOT NULL DEFAULT '{}',
  sort_by text,
  sort_direction text NOT NULL DEFAULT 'desc',
  visibility text NOT NULL DEFAULT 'private',
  shared_with uuid[] NOT NULL DEFAULT '{}',
  is_shared boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  charts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_views TO authenticated;
GRANT ALL ON public.list_views TO service_role;

ALTER TABLE public.list_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own or shared views"
ON public.list_views FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR visibility = 'everyone'
  OR (visibility = 'selected' AND auth.uid() = ANY (shared_with))
);

CREATE POLICY "Users can create own views"
ON public.list_views FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own views"
ON public.list_views FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own views"
ON public.list_views FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX list_views_section_user_idx ON public.list_views (section, user_id);

CREATE TRIGGER update_list_views_updated_at
BEFORE UPDATE ON public.list_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();