
CREATE TABLE IF NOT EXISTS public.app_configuration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module, config_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_configuration TO authenticated;
GRANT ALL ON public.app_configuration TO service_role;

ALTER TABLE public.app_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_configuration read for authenticated"
  ON public.app_configuration FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "app_configuration admin insert"
  ON public.app_configuration FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "app_configuration admin update"
  ON public.app_configuration FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "app_configuration admin delete"
  ON public.app_configuration FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER app_configuration_set_updated_at
  BEFORE UPDATE ON public.app_configuration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
