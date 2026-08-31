DROP POLICY IF EXISTS "Admins can manage company profile" ON public.company_profile;

CREATE POLICY "Admins can manage company profile"
ON public.company_profile
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
  OR public.has_security_management_access(auth.uid(), 'edit')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.can_access_object(auth.uid(), 'company_profile', 'edit')
  OR public.has_security_management_access(auth.uid(), 'edit')
);