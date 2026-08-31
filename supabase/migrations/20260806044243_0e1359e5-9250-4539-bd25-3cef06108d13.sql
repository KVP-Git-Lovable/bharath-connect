-- 1. Grant admin role to the two System Administrator users missing it
INSERT INTO public.user_roles (user_id, role)
SELECT usp.user_id, 'admin'::public.app_role
FROM public.user_security_profiles usp
JOIN public.security_profiles sp ON sp.id = usp.profile_id
WHERE lower(sp.name) IN ('administrator', 'system administrator')
ON CONFLICT DO NOTHING;

-- Remove stale non-admin role rows for those same users
DELETE FROM public.user_roles ur
WHERE ur.role <> 'admin'::public.app_role
  AND EXISTS (
    SELECT 1 FROM public.user_security_profiles usp
    JOIN public.security_profiles sp ON sp.id = usp.profile_id
    WHERE usp.user_id = ur.user_id
      AND lower(sp.name) IN ('administrator', 'system administrator')
  );

-- 2. Stop device offline / low battery alerts
DO $$
DECLARE j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR j IN EXECUTE 'SELECT jobid, command FROM cron.job' LOOP
      IF j.command ILIKE '%offline%' OR j.command ILIKE '%battery%' OR j.command ILIKE '%device%' THEN
        EXECUTE format('SELECT cron.unschedule(%s)', j.jobid);
      END IF;
    END LOOP;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_notify_manager_low_battery ON public.users;
DROP FUNCTION IF EXISTS public.notify_manager_low_battery() CASCADE;
DROP FUNCTION IF EXISTS public.sweep_offline_device_alerts() CASCADE;
DROP FUNCTION IF EXISTS public.check_offline_devices() CASCADE;

-- 3. Purge existing alerts
DELETE FROM public.notifications
WHERE title LIKE 'Device offline%' OR title LIKE 'Low battery%';