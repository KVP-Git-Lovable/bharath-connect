-- Remove all existing device offline notifications
DELETE FROM public.notifications WHERE type = 'device_offline';

-- Drop the cron job that creates device offline notifications
SELECT cron.unschedule('sweep-offline-device-alerts');

-- Override the sweep function to do nothing instead of creating notifications
CREATE OR REPLACE FUNCTION public.sweep_offline_device_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- This function is disabled - device offline notifications have been removed
  -- Previously it would notify managers/admins of offline devices
  -- But this has been disabled as per user request
  NULL;
END;
$function$;

-- Ensure check_offline_devices doesn't create notifications either
CREATE OR REPLACE FUNCTION public.check_offline_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- This function is disabled - device offline notifications have been removed
  -- Previously it would check for offline devices and notify managers
  NULL;
END;
$function$;

-- Remove any scheduled jobs for offline device alerts
DELETE FROM cron.job WHERE jobname LIKE '%offline%' OR jobname LIKE '%device%';
