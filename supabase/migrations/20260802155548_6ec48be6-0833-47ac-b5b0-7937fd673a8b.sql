CREATE POLICY "Managers can view all user profile assignments"
ON public.user_security_profiles
FOR SELECT
TO authenticated
USING (
  public.has_security_management_access(auth.uid(), 'view')
  OR public.can_access_object(auth.uid(), 'users', 'view')
);