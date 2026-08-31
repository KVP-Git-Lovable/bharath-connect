-- Sequence for friendly activity codes
CREATE SEQUENCE IF NOT EXISTS public.activity_code_seq;

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS activity_code text;

-- Backfill existing rows in creation order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.activity_events
  WHERE activity_code IS NULL
)
UPDATE public.activity_events ae
SET activity_code = 'ACT-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE ae.id = o.id;

-- Advance the sequence past the backfilled values
SELECT setval('public.activity_code_seq', GREATEST((SELECT count(*) FROM public.activity_events), 1));

-- Trigger to auto-generate code on insert
CREATE OR REPLACE FUNCTION public.set_activity_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.activity_code IS NULL THEN
    NEW.activity_code := 'ACT-' || lpad(nextval('public.activity_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_activity_code ON public.activity_events;
CREATE TRIGGER trg_set_activity_code
BEFORE INSERT ON public.activity_events
FOR EACH ROW EXECUTE FUNCTION public.set_activity_code();

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_activity_code_key
  ON public.activity_events (activity_code);
