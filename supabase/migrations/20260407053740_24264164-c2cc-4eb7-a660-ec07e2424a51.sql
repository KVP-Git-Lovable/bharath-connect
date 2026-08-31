
CREATE OR REPLACE TRIGGER on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
