-- Fix: Restore activity types master data and ensure proper RLS access
-- This migration ensures authenticated users can view activity types

-- First, check if the table exists and recreate RLS policies
ALTER TABLE IF EXISTS public.activity_types_master DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated can view activity types" ON public.activity_types_master;
DROP POLICY IF EXISTS "Authenticated can insert activity types" ON public.activity_types_master;
DROP POLICY IF EXISTS "Admins can update activity types" ON public.activity_types_master;
DROP POLICY IF EXISTS "Admins can delete activity types" ON public.activity_types_master;

-- Re-enable RLS
ALTER TABLE IF EXISTS public.activity_types_master ENABLE ROW LEVEL SECURITY;

-- Create new permissive policies
CREATE POLICY "View activity types"
  ON public.activity_types_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert activity types"
  ON public.activity_types_master FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Update activity types"
  ON public.activity_types_master FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Delete activity types"
  ON public.activity_types_master FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Re-seed activity types (only if they're missing)
INSERT INTO public.activity_types_master (name, is_active, sort_order) VALUES
  ('Site Visit', true, 10),
  ('Contractor Meeting', true, 20),
  ('Material Inspection', true, 30),
  ('Client Meeting', true, 40),
  ('Survey Work', true, 50),
  ('Office Work', true, 60),
  ('Travel', true, 70),
  ('Training', true, 80),
  ('Other', true, 90)
ON CONFLICT (name) DO NOTHING;
