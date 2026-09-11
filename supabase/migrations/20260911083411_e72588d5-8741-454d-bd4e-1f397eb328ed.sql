-- Notifications & Reports — Phase 2: delivery foundation
-- Additive only. Existing notifications, policies and the app's own
-- dispatch-notification flow are unchanged.

-- 1. Richer notification rows ------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS read_at         timestamptz,
  ADD COLUMN IF NOT EXISTS is_dismissed    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text        NOT NULL DEFAULT 'delivered';

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- Stamp read_at when a notification is first marked read.
CREATE OR REPLACE FUNCTION public.notifications_set_read_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_read IS TRUE AND COALESCE(OLD.is_read, false) IS FALSE AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_read_at ON public.notifications;
CREATE TRIGGER trg_notifications_read_at
  BEFORE UPDATE OF is_read ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_set_read_at();

-- 2. Per-user preferences ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL,
  notification_type text        NOT NULL,
  is_enabled        boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view notification preferences" ON public.notification_preferences;
CREATE POLICY "Admins view notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Private push config (no policies: only SECURITY DEFINER code and the
--    service role can read it) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_push_config (
  id             boolean     PRIMARY KEY DEFAULT true CHECK (id),
  function_url   text        NOT NULL,
  trigger_secret text        NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_config FROM anon, authenticated;
GRANT ALL ON public.notification_push_config TO service_role;

INSERT INTO public.notification_push_config (id, function_url, trigger_secret)
VALUES (
  true,
  'https://ourwadwhfdwtuwzvkopw.supabase.co/functions/v1/notification-push',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
ON CONFLICT (id) DO NOTHING;

-- 4. Guard: only the rules engine / report generator may mark a row for
--    server push. Ordinary users can still insert notifications (existing
--    policy), but any metadata.source they set is stripped.
CREATE OR REPLACE FUNCTION public.notifications_guard_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.metadata ? 'source'
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
     AND COALESCE(current_setting('sbee.notif_engine', true), '') <> 'on' THEN
    NEW.metadata := NEW.metadata - 'source';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_source ON public.notifications;
CREATE TRIGGER trg_notifications_guard_source
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_guard_source();

-- 5. Scoped push: only rows from the rules engine or scheduled reports.
--    App-sent notifications keep using dispatch-notification, so nothing is
--    pushed twice. Never blocks the insert.
CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  BEGIN
    IF lower(COALESCE(NEW.metadata->>'push_to_phone', 'true')) = 'false' THEN
      RETURN NEW;
    END IF;

    SELECT function_url, trigger_secret INTO v_url, v_secret
    FROM public.notification_push_config WHERE id = true;

    IF v_url IS NULL OR v_secret IS NULL THEN
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'notifications_dispatch_push failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notifications_dispatch_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notifications_dispatch_push ON public.notifications;
CREATE TRIGGER trg_notifications_dispatch_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  WHEN (NEW.metadata->>'source' IN ('rules_engine', 'report'))
  EXECUTE FUNCTION public.notifications_dispatch_push();