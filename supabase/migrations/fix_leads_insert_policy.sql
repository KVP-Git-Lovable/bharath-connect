-- Fix: Allow authenticated users to insert their own leads
-- The previous 'FOR ALL' policy was too restrictive for INSERT operations

DROP POLICY IF EXISTS "Users see own leads, admins see all" ON public.leads;

-- SELECT policy: users see own, admins see all
CREATE POLICY "Users see own leads, admins see all - SELECT"
  ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  );

-- INSERT policy: authenticated users can create leads for themselves
CREATE POLICY "Users create own leads, admins create for anyone - INSERT"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  );

-- UPDATE policy: users update own, admins update all
CREATE POLICY "Users update own leads, admins update all - UPDATE"
  ON public.leads FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  );

-- DELETE policy: users delete own, admins delete all
CREATE POLICY "Users delete own leads, admins delete all - DELETE"
  ON public.leads FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = owner_id
  );
