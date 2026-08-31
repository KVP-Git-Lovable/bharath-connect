DROP TRIGGER IF EXISTS on_notification_inserted ON public.notifications;
DROP FUNCTION IF EXISTS public.notify_push_on_insert();