
ALTER TABLE public.activity_events
ADD COLUMN status_changed_at TIMESTAMPTZ,
ADD COLUMN status_change_lat NUMERIC,
ADD COLUMN status_change_lng NUMERIC;
