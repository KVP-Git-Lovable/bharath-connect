ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS travel_distance_km numeric,
  ADD COLUMN IF NOT EXISTS travel_time_mins integer,
  ADD COLUMN IF NOT EXISTS travel_from_type text,
  ADD COLUMN IF NOT EXISTS travel_from_activity_id uuid REFERENCES public.activity_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS travel_from_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_distance_km numeric,
  ADD COLUMN IF NOT EXISTS manual_distance_note text,
  ADD COLUMN IF NOT EXISTS manual_distance_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;