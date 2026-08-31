-- 1. Track whether we've already notified about the current offline period,
--    so the periodic check doesn't spam a notification every run.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS device_offline_notified boolean NOT NULL DEFAULT false;

-- 2. Reset the flag whenever the device reports in again
CREATE OR REPLACE FUNCTION public.report_device_status(
  _battery integer,
  _charging boolean,
  _network text,
  _platform text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _battery IS NOT NULL AND (_battery < 0 OR _battery > 100) THEN
    RAISE EXCEPTION 'battery out of range';
  END IF;

  UPDATE public.users
     SET battery_level           = _battery,
         battery_charging        = _charging,
         network_type            = _network,
         device_platform         = _platform,
         device_status_at        = now(),
         device_offline_notified = false
   WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_device_status(integer, boolean, text, text) TO authenticated;

-- 3. Periodic check: find users whose device stopped reporting (switched off,
--    or the app/browser stopped sending heartbeats) and notify their manager
--    and admins, mirroring notify_manager_low_battery()'s recipient logic.
CREATE OR REPLACE FUNCTION public.check_offline_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_name text;
  v_manager uuid;
  v_admin_id uuid;
  v_title text;
  v_msg text;
BEGIN
  FOR v_user IN
    SELECT id, full_name, username, email, battery_level, reporting_manager_id
    FROM public.users
    WHERE is_active = true
      AND device_status_at IS NOT NULL
      AND device_status_at < now() - interval '3 minutes'
      AND device_offline_notified = false
  LOOP
    v_name := COALESCE(v_user.full_name, v_user.username, v_user.email);
    v_title := 'Phone switched off: ' || v_name;
    v_msg   := v_name || ' phone is now Switched Off. The last reported battery value was '
               || COALESCE(v_user.battery_level::text, 'unknown') || '%.';

    v_manager := v_user.reporting_manager_id;
    IF v_manager IS NOT NULL AND v_manager <> v_user.id THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
      VALUES (v_manager, v_title, v_msg, 'warning', 'users', v_user.id);
    END IF;

    FOR v_admin_id IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role = 'admin'
        AND ur.user_id <> v_user.id
        AND (v_manager IS NULL OR ur.user_id <> v_manager)
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
      VALUES (v_admin_id, v_title, v_msg, 'warning', 'users', v_user.id);
    END LOOP;

    UPDATE public.users SET device_offline_notified = true WHERE id = v_user.id;
  END LOOP;
END;
$$;

-- 4. Schedule the check to run every minute via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-offline-devices') THEN
    PERFORM cron.unschedule('check-offline-devices');
  END IF;
END $$;

SELECT cron.schedule(
  'check-offline-devices',
  '* * * * *',
  $$SELECT public.check_offline_devices();$$
);
