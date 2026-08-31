
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, pd.name, pd.type, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN public.permission_definitions pd
WHERE sp.name = 'Administrator'
  AND pd.is_active = true
ON CONFLICT (profile_id, object_name, permission_type) DO UPDATE
SET can_read = true, can_create = true, can_edit = true,
    can_delete = true, can_view_all = true, can_modify_all = true;
