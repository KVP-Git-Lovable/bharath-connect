CREATE TABLE public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_favourite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT ALL ON public.saved_reports TO service_role;
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own saved reports" ON public.saved_reports FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX saved_reports_user_module_idx ON public.saved_reports (user_id, module);
CREATE TRIGGER update_saved_reports_updated_at BEFORE UPDATE ON public.saved_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();