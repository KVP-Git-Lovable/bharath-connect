CREATE TABLE public.gps_tracker_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gps_tracker_events_user_time ON public.gps_tracker_events (user_id, occurred_at DESC);

GRANT SELECT, INSERT ON public.gps_tracker_events TO authenticated;
GRANT ALL ON public.gps_tracker_events TO service_role;

ALTER TABLE public.gps_tracker_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own tracker events"
  ON public.gps_tracker_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own tracker events"
  ON public.gps_tracker_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all tracker events"
  ON public.gps_tracker_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers read team tracker events"
  ON public.gps_tracker_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.get_user_hierarchy(auth.uid()) h WHERE h.user_id = gps_tracker_events.user_id));