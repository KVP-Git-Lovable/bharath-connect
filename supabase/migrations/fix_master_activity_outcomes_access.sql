-- Fix: Restore master activity outcomes master data and ensure proper RLS access

-- Check if table exists first
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'master_activity_outcomes'
  ) THEN
    -- Create table if it doesn't exist
    CREATE TABLE public.master_activity_outcomes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.master_activity_outcomes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "admin_can_manage_outcomes" ON public.master_activity_outcomes;
DROP POLICY IF EXISTS "authenticated_can_read_outcomes" ON public.master_activity_outcomes;
DROP POLICY IF EXISTS "anyone_can_read_outcomes" ON public.master_activity_outcomes;

-- Create clear, separate policies
-- SELECT: All authenticated users can read
CREATE POLICY "Activity outcomes readable by all"
  ON public.master_activity_outcomes FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Only admins
CREATE POLICY "Activity outcomes insert admin only"
  ON public.master_activity_outcomes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- UPDATE: Only admins
CREATE POLICY "Activity outcomes update admin only"
  ON public.master_activity_outcomes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- DELETE: Only admins
CREATE POLICY "Activity outcomes delete admin only"
  ON public.master_activity_outcomes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Re-seed activity outcomes (only if they're missing)
INSERT INTO public.master_activity_outcomes (name, description, is_active, sort_order) VALUES
  ('Productive', 'Activities that resulted in positive outcomes or progress', true, 10),
  ('Not Started', 'Activities that were planned but not started', true, 20),
  ('Pending', 'Activities awaiting follow-up or decision', true, 30),
  ('Completed', 'Activities that were successfully completed', true, 40),
  ('Cancelled', 'Activities that were cancelled or postponed', true, 50),
  ('Rescheduled', 'Activities that need to be rescheduled', true, 60)
ON CONFLICT (name) DO NOTHING;
