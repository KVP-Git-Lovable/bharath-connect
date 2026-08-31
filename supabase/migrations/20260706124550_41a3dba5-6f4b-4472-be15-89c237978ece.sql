-- 1. Columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS battery_level integer,
  ADD COLUMN IF NOT EXISTS battery_charging boolean,
  ADD COLUMN IF NOT EXISTS network_type text,
  ADD COLUMN IF NOT EXISTS device_platform text,
  ADD COLUMN IF NOT EXISTS device_status_at timestamptz;

-- 2. Secure RPC so users can only update their own status columns
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
     SET battery_level    = _battery,
         battery_charging = _charging,
         network_type     = _network,
         device_platform  = _platform,
         device_status_at = now()
   WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_device_status(integer, boolean, text, text) TO authenticated;

-- 3. Low-battery notification trigger
CREATE OR REPLACE FUNCTION public.notify_manager_low_battery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_manager uuid;
  v_admin_id uuid;
  v_title text;
  v_msg text;
BEGIN
  -- Only act when battery crosses from >=30 (or null) down to <30 while not charging
  IF NEW.battery_level IS NULL OR NEW.battery_level >= 30 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.battery_charging, false) = true THEN
    RETURN NEW;
  END IF;
  IF OLD.battery_level IS NOT NULL AND OLD.battery_level < 30 THEN
    RETURN NEW; -- already low, don't spam
  END IF;

  v_name := COALESCE(NEW.full_name, NEW.username, NEW.email);
  v_title := 'Low battery: ' || v_name;
  v_msg   := v_name || '''s device is at ' || NEW.battery_level || '% and not charging.';

  -- Reporting manager
  v_manager := NEW.reporting_manager_id;
  IF v_manager IS NOT NULL AND v_manager <> NEW.id THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
    VALUES (v_manager, v_title, v_msg, 'warning', 'users', NEW.id);
  END IF;

  -- All admins (except the user themselves and the manager we already notified)
  FOR v_admin_id IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role = 'admin'
      AND ur.user_id <> NEW.id
      AND (v_manager IS NULL OR ur.user_id <> v_manager)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
    VALUES (v_admin_id, v_title, v_msg, 'warning', 'users', NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_manager_low_battery ON public.users;
CREATE TRIGGER trg_notify_manager_low_battery
AFTER UPDATE OF battery_level ON public.users
FOR EACH ROW
WHEN (NEW.battery_level IS DISTINCT FROM OLD.battery_level)
EXECUTE FUNCTION public.notify_manager_low_battery();