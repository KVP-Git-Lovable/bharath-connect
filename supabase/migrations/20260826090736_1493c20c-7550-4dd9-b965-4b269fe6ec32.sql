DROP POLICY IF EXISTS "Admins can manage all app users" ON public.users;

CREATE POLICY "Admins can manage all app users"
ON public.users
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_object(auth.uid(), 'users', 'edit')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_object(auth.uid(), 'users', 'edit')
);