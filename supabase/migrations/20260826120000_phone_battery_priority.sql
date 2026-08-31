-- report_device_status is called from every logged-in device roughly once a
-- minute (see src/hooks/useDeviceStatusReporter.ts). Previously it did a
-- plain last-write-wins UPDATE, so a user signed in on both a phone and a
-- Mac/PC would have their battery_level flap between the two depending on
-- whose heartbeat landed last.
--
-- Fix: while a phone (native APK, or mobile Chrome/Safari) has reported
-- within the last 3 minutes, ignore updates coming from a desktop browser —
-- the phone's battery reading always wins as long as the phone is actively
-- reporting. If the phone goes stale (app closed, no signal), desktop
-- reports resume updating normally.
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
  v_is_current_phone := v_current_platform IN ('android-native', 'ios-native', 'web-android', 'web-ios', 'native');

  IF NOT v_is_new_phone
     AND v_is_current_phone
     AND v_current_status_at IS NOT NULL
     AND v_current_status_at > now() - interval '3 minutes'
  THEN
    -- A phone is still actively reporting; don't let a desktop heartbeat
    -- overwrite its battery reading.
    RETURN;
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
