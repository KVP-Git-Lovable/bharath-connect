ALTER TABLE public.activity_events
ADD COLUMN IF NOT EXISTS assigned_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;