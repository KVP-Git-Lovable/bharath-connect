
-- Ensure pg_cron is available for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) Rewrite low-battery trigger: manager-only + 10-minute throttle
CREATE OR REPLACE FUNCTION public.notify_manager_low_battery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_name text;
  v_manager uuid;
  v_last_at timestamptz;
BEGIN
  -- Only care about active users with a reporting manager
  IF COALESCE(NEW.is_active, true) = false THEN
    RETURN NEW;
  END IF;

  v_manager := NEW.reporting_manager_id;
  IF v_manager IS NULL OR v_manager = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Only when battery is low and not charging
  IF NEW.battery_level IS NULL OR NEW.battery_level >= 30 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.battery_charging, false) = true THEN
    RETURN NEW;
  END IF;

  -- Throttle: skip if a low-battery alert was sent to this manager for this
  -- user within the last 10 minutes.
  SELECT MAX(created_at) INTO v_last_at
  FROM public.notifications
  WHERE user_id = v_manager
    AND related_table = 'users'
    AND related_id = NEW.id
    AND title LIKE 'Low battery:%';

  IF v_last_at IS NOT NULL AND v_last_at > now() - interval '10 minutes' THEN
    RETURN NEW;
  END IF;

  v_name := COALESCE(NEW.full_name, NEW.username, NEW.email);

  INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
  VALUES (
    v_manager,
    'Low battery: ' || v_name,
    'Battery level is below 30% for user ' || v_name,
    'warning',
    'users',
    NEW.id
  );

  RETURN NEW;
END;
$function$;

-- 2) Offline / phone-off sweep: notify manager immediately then every 10 min
CREATE OR REPLACE FUNCTION public.sweep_offline_device_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r RECORD;
  v_last_at timestamptz;
  v_name text;
BEGIN
  FOR r IN
    SELECT u.id, u.full_name, u.username, u.email, u.reporting_manager_id
    FROM public.users u
    WHERE u.is_active = true
      AND u.reporting_manager_id IS NOT NULL
      AND u.reporting_manager_id <> u.id
      AND u.device_status_at IS NOT NULL
      AND u.device_status_at < now() - interval '2 minutes'
  LOOP
    SELECT MAX(created_at) INTO v_last_at
    FROM public.notifications
    WHERE user_id = r.reporting_manager_id
      AND related_table = 'users'
      AND related_id = r.id
      AND title LIKE 'Device offline:%';

    IF v_last_at IS NOT NULL AND v_last_at > now() - interval '10 minutes' THEN
      CONTINUE;
    END IF;

    v_name := COALESCE(r.full_name, r.username, r.email);

    INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
    VALUES (
      r.reporting_manager_id,
      'Device offline: ' || v_name,
      'User ' || v_name || '''s phone appears to be switched off or offline',
      'warning',
      'users',
      r.id
    );
  END LOOP;
END;
$function$;

-- 3) Schedule the sweep every minute (idempotent: unschedule any prior job)
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'sweep-offline-device-alerts'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'sweep-offline-device-alerts',
  '* * * * *',
  $$ SELECT public.sweep_offline_device_alerts(); $$
);
