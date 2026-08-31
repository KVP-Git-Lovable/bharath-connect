CREATE TABLE public.ta_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  per_km_rate numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_to date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ta_rate_history TO authenticated;
GRANT ALL ON public.ta_rate_history TO service_role;

ALTER TABLE public.ta_rate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ta_rate_history read authenticated"
ON public.ta_rate_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "ta_rate_history admin write"
ON public.ta_rate_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ta_rate_history_updated_at
BEFORE UPDATE ON public.ta_rate_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_ta_rate_for_date(_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT per_km_rate FROM public.ta_rate_history
      WHERE effective_from <= _date
        AND (effective_to IS NULL OR effective_to >= _date)
      ORDER BY effective_from DESC LIMIT 1),
    (SELECT ta_per_km_rate FROM public.expense_master_config
      ORDER BY updated_at DESC LIMIT 1),
    0
  );
$$;

INSERT INTO public.ta_rate_history (per_km_rate, effective_from, note)
SELECT COALESCE(ta_per_km_rate, 0), '2000-01-01'::date, 'Initial rate'
FROM public.expense_master_config
ORDER BY updated_at DESC
LIMIT 1;