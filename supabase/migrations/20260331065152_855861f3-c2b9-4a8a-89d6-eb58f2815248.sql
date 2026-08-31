
-- 1. Create push_tokens table
CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own tokens
CREATE POLICY "Users can insert own tokens"
  ON public.push_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.push_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own tokens"
  ON public.push_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role needs full access for cleanup from edge function
CREATE POLICY "Service role full access"
  ON public.push_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Create trigger function that calls the edge function
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    PERFORM extensions.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      body := json_build_object(
        'user_id', NEW.user_id,
        'title', NEW.title,
        'message', NEW.message
      )::text,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to notifications table
CREATE TRIGGER on_notification_inserted
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
