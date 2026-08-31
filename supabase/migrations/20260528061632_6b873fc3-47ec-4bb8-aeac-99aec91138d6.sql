ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_last_seen_at ON public.push_tokens(last_seen_at);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'push_tokens'
      AND policyname = 'Users can update own tokens'
  ) THEN
    CREATE POLICY "Users can update own tokens" ON public.push_tokens
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;