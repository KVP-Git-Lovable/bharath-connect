ALTER TABLE public.site_milestones
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date,
  ADD COLUMN IF NOT EXISTS percent_complete integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.validate_site_milestone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.percent_complete < 0 OR NEW.percent_complete > 100 THEN
    RAISE EXCEPTION 'percent_complete must be between 0 and 100';
  END IF;
  IF NEW.actual_start_date IS NOT NULL AND NEW.actual_end_date IS NOT NULL
     AND NEW.actual_end_date < NEW.actual_start_date THEN
    RAISE EXCEPTION 'actual_end_date cannot be earlier than actual_start_date';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_site_milestone ON public.site_milestones;
CREATE TRIGGER trg_validate_site_milestone
  BEFORE INSERT OR UPDATE ON public.site_milestones
  FOR EACH ROW EXECUTE FUNCTION public.validate_site_milestone();