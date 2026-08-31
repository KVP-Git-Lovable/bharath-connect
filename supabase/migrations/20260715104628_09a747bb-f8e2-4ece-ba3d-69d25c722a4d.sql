
-- Opportunity enhancements
ALTER TABLE public.customer_opportunities
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS opportunity_source_id uuid,
  ADD COLUMN IF NOT EXISTS requirements_highlights text,
  ADD COLUMN IF NOT EXISTS budget_status text,
  ADD COLUMN IF NOT EXISTS authority_role text,
  ADD COLUMN IF NOT EXISTS need_level text,
  ADD COLUMN IF NOT EXISTS timeline text,
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid,
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now();

-- Backfill stage_changed_at for existing rows
UPDATE public.customer_opportunities SET stage_changed_at = COALESCE(stage_changed_at, updated_at, created_at) WHERE stage_changed_at IS NULL;

-- Trigger: update stage_changed_at when stage changes
CREATE OR REPLACE FUNCTION public.opportunity_stage_change_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.stage,'') IS DISTINCT FROM COALESCE(OLD.stage,'') THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_opportunity_stage_change ON public.customer_opportunities;
CREATE TRIGGER trg_opportunity_stage_change BEFORE UPDATE ON public.customer_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_stage_change_trigger();

-- Currency Master
CREATE TABLE IF NOT EXISTS public.master_currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  symbol text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_currencies TO authenticated;
GRANT ALL ON public.master_currencies TO service_role;
ALTER TABLE public.master_currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read currencies" ON public.master_currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write currencies" ON public.master_currencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_currencies_updated BEFORE UPDATE ON public.master_currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.master_currencies (code, symbol, name, sort_order) VALUES
  ('INR','₹','Indian Rupee',1),
  ('USD','$','US Dollar',2),
  ('EUR','€','Euro',3),
  ('GBP','£','British Pound',4),
  ('AED','د.إ','UAE Dirham',5)
ON CONFLICT (code) DO NOTHING;

-- Payment Terms Master
CREATE TABLE IF NOT EXISTS public.master_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_payment_terms TO authenticated;
GRANT ALL ON public.master_payment_terms TO service_role;
ALTER TABLE public.master_payment_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pt" ON public.master_payment_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write pt" ON public.master_payment_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_master_payment_terms_updated BEFORE UPDATE ON public.master_payment_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.master_payment_terms (name, sort_order) VALUES
  ('Net 15',1),('Net 30',2),('Net 45',3),('Net 60',4),
  ('50% Advance',5),('Full Advance',6),('Milestone Based',7)
ON CONFLICT (name) DO NOTHING;
