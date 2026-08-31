CREATE OR REPLACE FUNCTION public.has_security_management_access(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::public.app_role)
      OR public.can_access_object(_user_id, 'security', _permission)
      OR NOT EXISTS (
        SELECT 1
        FROM public.user_security_profiles usp
        WHERE usp.user_id = _user_id
      )
    )
$$;

DROP POLICY IF EXISTS "Admins or security-managers can manage security profiles" ON public.security_profiles;
DROP POLICY IF EXISTS "Security managers can create security profiles" ON public.security_profiles;
DROP POLICY IF EXISTS "Security managers can edit security profiles" ON public.security_profiles;
DROP POLICY IF EXISTS "Security managers can delete security profiles" ON public.security_profiles;

CREATE POLICY "Security managers can create security profiles"
ON public.security_profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_security_management_access(auth.uid(), 'create'));

CREATE POLICY "Security managers can edit security profiles"
ON public.security_profiles
FOR UPDATE
TO authenticated
USING (public.has_security_management_access(auth.uid(), 'edit'))
WITH CHECK (public.has_security_management_access(auth.uid(), 'edit'));

CREATE POLICY "Security managers can delete security profiles"
ON public.security_profiles
FOR DELETE
TO authenticated
USING (public.has_security_management_access(auth.uid(), 'delete'));

DROP POLICY IF EXISTS "Admins or security-managers can manage permissions" ON public.profile_object_permissions;
DROP POLICY IF EXISTS "Security managers can create profile permissions" ON public.profile_object_permissions;
DROP POLICY IF EXISTS "Security managers can edit profile permissions" ON public.profile_object_permissions;
DROP POLICY IF EXISTS "Security managers can delete profile permissions" ON public.profile_object_permissions;

CREATE POLICY "Security managers can create profile permissions"
ON public.profile_object_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_security_management_access(auth.uid(), 'create')
  OR public.has_security_management_access(auth.uid(), 'edit')
);

CREATE POLICY "Security managers can edit profile permissions"
ON public.profile_object_permissions
FOR UPDATE
TO authenticated
USING (public.has_security_management_access(auth.uid(), 'edit'))
WITH CHECK (public.has_security_management_access(auth.uid(), 'edit'));

CREATE POLICY "Security managers can delete profile permissions"
ON public.profile_object_permissions
FOR DELETE
TO authenticated
USING (
  public.has_security_management_access(auth.uid(), 'delete')
  OR public.has_security_management_access(auth.uid(), 'edit')
);

DROP POLICY IF EXISTS "Admins or security-managers can manage user security profiles" ON public.user_security_profiles;
DROP POLICY IF EXISTS "Security or user managers can create user profile assignments" ON public.user_security_profiles;
DROP POLICY IF EXISTS "Security or user managers can edit user profile assignments" ON public.user_security_profiles;
DROP POLICY IF EXISTS "Security or user managers can delete user profile assignments" ON public.user_security_profiles;

CREATE POLICY "Security or user managers can create user profile assignments"
ON public.user_security_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_security_management_access(auth.uid(), 'create')
  OR public.can_access_object(auth.uid(), 'users', 'edit')
);

CREATE POLICY "Security or user managers can edit user profile assignments"
ON public.user_security_profiles
FOR UPDATE
TO authenticated
USING (
  public.has_security_management_access(auth.uid(), 'edit')
  OR public.can_access_object(auth.uid(), 'users', 'edit')
)
WITH CHECK (
  public.has_security_management_access(auth.uid(), 'edit')
  OR public.can_access_object(auth.uid(), 'users', 'edit')
);

CREATE POLICY "Security or user managers can delete user profile assignments"
ON public.user_security_profiles
FOR DELETE
TO authenticated
USING (
  public.has_security_management_access(auth.uid(), 'delete')
  OR public.can_access_object(auth.uid(), 'users', 'edit')
);