
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  related_table TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

-- Users can update own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Authenticated users can insert notifications (for cross-user inserts)
CREATE POLICY "Authenticated can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create send_notification SECURITY DEFINER function for admin/system inserts
CREATE OR REPLACE FUNCTION public.send_notification(
  user_id_param UUID,
  title_param TEXT,
  message_param TEXT,
  type_param TEXT DEFAULT 'info',
  related_table_param TEXT DEFAULT NULL,
  related_id_param UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, related_table, related_id)
  VALUES (user_id_param, title_param, message_param, type_param, related_table_param, related_id_param)
  RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$;
