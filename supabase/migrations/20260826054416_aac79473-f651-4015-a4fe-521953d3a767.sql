CREATE OR REPLACE FUNCTION public.report_device_status(_battery integer, _charging boolean, _network text, _platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_current_platform text;
  v_current_status_at timestamptz;
  v_is_new_phone boolean;
  v_is_current_phone boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _battery IS NOT NULL AND (_battery < 0 OR _battery > 100) THEN
    RAISE EXCEPTION 'battery out of range';
  END IF;

  SELECT device_platform, device_status_at
    INTO v_current_platform, v_current_status_at
    FROM public.users
   WHERE id = v_uid;

  v_is_new_phone := _platform IN ('android-native', 'ios-native', 'web-android', 'web-ios', 'native');
  v_is_current_phone := COALESCE(v_current_platform, '') IN ('android-native', 'ios-native', 'web-android', 'web-ios', 'native');

  -- A phone that is still actively reporting wins: a desktop heartbeat must not
  -- overwrite the phone battery reading for the same user.
  IF NOT v_is_new_phone
     AND v_is_current_phone
     AND v_current_status_at IS NOT NULL
     AND v_current_status_at > now() - interval '10 minutes'
  THEN
    RETURN;
  END IF;

  UPDATE public.users
     SET battery_level    = _battery,
         battery_charging = _charging,
         network_type     = _network,
         device_platform  = _platform,
         device_status_at = now()
   WHERE id = v_uid;
END;
$function$;