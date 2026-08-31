-- Delete all device_offline notifications that may have been created
DELETE FROM public.notifications WHERE type = 'device_offline';

-- Ensure the sweep function doesn't create new ones
ALTER TABLE public.cron_schedule DISABLE TRIGGER ALL;
DELETE FROM public.cron_schedule WHERE command LIKE '%device%' OR command LIKE '%offline%';
ALTER TABLE public.cron_schedule ENABLE TRIGGER ALL;
