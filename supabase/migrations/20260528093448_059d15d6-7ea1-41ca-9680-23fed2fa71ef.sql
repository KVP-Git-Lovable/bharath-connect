CREATE TABLE public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wps_user_id ON public.web_push_subscriptions(user_id);
CREATE INDEX idx_wps_last_seen_at ON public.web_push_subscriptions(last_seen_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own web push subs"
  ON public.web_push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own web push subs"
  ON public.web_push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own web push subs"
  ON public.web_push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own web push subs"
  ON public.web_push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);