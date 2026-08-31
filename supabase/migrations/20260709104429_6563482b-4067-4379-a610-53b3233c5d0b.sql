
ALTER TABLE public.opportunity_quotes ADD COLUMN IF NOT EXISTS is_synced boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_synced_quote_per_opp
  ON public.opportunity_quotes(opportunity_id) WHERE is_synced;

CREATE OR REPLACE FUNCTION public.sync_opportunity_amount_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_synced THEN
    UPDATE public.opportunity_quotes
      SET is_synced = false
      WHERE opportunity_id = NEW.opportunity_id
        AND id <> NEW.id
        AND is_synced = true;
    UPDATE public.customer_opportunities
      SET amount = NEW.total, updated_at = now()
      WHERE id = NEW.opportunity_id
        AND COALESCE(amount, 0) <> COALESCE(NEW.total, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_opportunity_amount ON public.opportunity_quotes;
CREATE TRIGGER trg_sync_opportunity_amount
AFTER INSERT OR UPDATE OF is_synced, total ON public.opportunity_quotes
FOR EACH ROW EXECUTE FUNCTION public.sync_opportunity_amount_from_quote();
