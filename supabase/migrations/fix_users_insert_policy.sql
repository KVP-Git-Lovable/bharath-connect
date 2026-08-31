-- Fix: Add INSERT policy to public.users table to allow user creation during signup/password reset
-- This allows the handle_new_user trigger to create user records when auth.users entries are created

DROP POLICY IF EXISTS "Users can insert own app user record" ON public.users;

CREATE POLICY "Users can insert own app user record"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- Also allow service role (backend/triggers) to insert
DROP POLICY IF EXISTS "Service role can insert app users" ON public.users;

CREATE POLICY "Service role can insert app users"
ON public.users
FOR INSERT
TO service_role
WITH CHECK (true);
