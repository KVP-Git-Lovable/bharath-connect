
INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT p.id, m.name, 'module', true, true, true, true, true, true
FROM public.security_profiles p
CROSS JOIN (VALUES ('module_customers'), ('module_opportunities')) AS m(name)
WHERE p.name = 'Administrator'
ON CONFLICT DO NOTHING;

INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT p.id, m.name, 'module', true, true, true, false, false, false
FROM public.security_profiles p
CROSS JOIN (VALUES ('module_customers'), ('module_opportunities')) AS m(name)
WHERE p.name IN ('Sales Manager','Sales Executive')
ON CONFLICT DO NOTHING;
