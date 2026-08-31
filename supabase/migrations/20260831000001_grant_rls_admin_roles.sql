-- RLS policies check public.user_roles via has_role(), which is separate from
-- users.role_id and from security profiles. Grant the RLS 'admin' role to the
-- admin users, and give the System Administrator profile the object-level
-- 'users'/'security' permissions that can_access_object() checks.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM public.users u
WHERE u.email IN ('abhishek.kvp2979@gmail.com', 'shravan.k@kvpcorp.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'admin'::public.app_role
  );

INSERT INTO public.profile_object_permissions
  (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, obj.name, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES ('users'), ('security')) AS obj(name)
WHERE sp.name = 'System Administrator'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions pop
    WHERE pop.profile_id = sp.id AND pop.object_name = obj.name
  );
