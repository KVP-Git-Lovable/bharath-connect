-- Restrict lead and activity visibility: users see only their own, admins see all

-- 1. Update leads RLS policy - users only see their own
DROP POLICY IF EXISTS "Owners managers and admins manage leads" ON public.leads;
CREATE POLICY "Users see own leads, admins see all"
  ON public.leads FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  );

-- 2. Update activity_events RLS - simpler, already mostly correct
-- Drop the existing broad policy and replace with strict one
DROP POLICY IF EXISTS "Users can view own activities" ON public.activity_events;
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activity_events;
DROP POLICY IF EXISTS "Admins can manage all activities" ON public.activity_events;

CREATE POLICY "Users see own activities, admins see all - SELECT"
  ON public.activity_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = user_id
  );

CREATE POLICY "Users modify own activities, admins manage all - INSERT"
  ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = user_id
  );

CREATE POLICY "Users modify own activities, admins manage all - UPDATE"
  ON public.activity_events FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = user_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = user_id
  );

CREATE POLICY "Users modify own activities, admins manage all - DELETE"
  ON public.activity_events FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = user_id
  );
