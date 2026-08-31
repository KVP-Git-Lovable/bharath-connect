DROP POLICY IF EXISTS "Admins can manage security profiles" ON public.security_profiles;
CREATE POLICY "Admins or security-managers can manage security profiles"
ON public.security_profiles FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create') OR public.can_access_object(auth.uid(),'security','delete'))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create'));

DROP POLICY IF EXISTS "Admins can manage permissions" ON public.profile_object_permissions;
CREATE POLICY "Admins or security-managers can manage permissions"
ON public.profile_object_permissions FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create') OR public.can_access_object(auth.uid(),'security','delete'))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create'));

DROP POLICY IF EXISTS "Admins can manage user security profiles" ON public.user_security_profiles;
CREATE POLICY "Admins or security-managers can manage user security profiles"
ON public.user_security_profiles FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create') OR public.can_access_object(auth.uid(),'security','delete') OR public.can_access_object(auth.uid(),'users','edit'))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR public.can_access_object(auth.uid(),'security','edit') OR public.can_access_object(auth.uid(),'security','create') OR public.can_access_object(auth.uid(),'users','edit'));