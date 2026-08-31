
ALTER TABLE public.master_products ADD COLUMN IF NOT EXISTS default_unit_price numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.opportunity_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.customer_opportunities(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_quotes TO authenticated;
GRANT ALL ON public.opportunity_quotes TO service_role;
ALTER TABLE public.opportunity_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read quotes" ON public.opportunity_quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write quotes" ON public.opportunity_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_opportunity_quotes_updated BEFORE UPDATE ON public.opportunity_quotes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.opportunity_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.opportunity_quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.master_products(id),
  product_name text,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  term_months numeric,
  discount_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_quote_items TO authenticated;
GRANT ALL ON public.opportunity_quote_items TO service_role;
ALTER TABLE public.opportunity_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read quote items" ON public.opportunity_quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write quote items" ON public.opportunity_quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_quotes_opp ON public.opportunity_quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON public.opportunity_quote_items(quote_id);
