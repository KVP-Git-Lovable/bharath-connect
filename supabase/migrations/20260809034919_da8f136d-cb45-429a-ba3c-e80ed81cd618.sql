ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS next_follow_up_date date,
  ADD COLUMN IF NOT EXISTS risk text;