-- Restore Expenses module to permission definitions and profiles

-- Ensure module_expenses exists in permission_definitions
INSERT INTO public.permission_definitions (name, display_name, object_type, parent_module, sort_order)
VALUES ('module_expenses', 'Expenses', 'module', NULL, 40)
ON CONFLICT (name) DO NOTHING;

-- Grant module_expenses to System Administrator profile
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, 'module_expenses', true, true, true, true, true, true
FROM public.security_profiles sp
WHERE sp.name = 'System Administrator'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions
    WHERE profile_id = sp.id AND object_name = 'module_expenses'
  );

-- Grant module_expenses to Sales Executive profile (read, create, edit only)
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, 'module_expenses', true, true, true, false, false, false
FROM public.security_profiles sp
WHERE sp.name = 'Sales Executive'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions
    WHERE profile_id = sp.id AND object_name = 'module_expenses'
  );

-- Grant module_expenses to Sales Manager profile (full access)
INSERT INTO public.profile_object_permissions (profile_id, object_name, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, 'module_expenses', true, true, true, true, true, true
FROM public.security_profiles sp
WHERE sp.name = 'Sales Manager'
  AND NOT EXISTS (
    SELECT 1 FROM public.profile_object_permissions
    WHERE profile_id = sp.id AND object_name = 'module_expenses'
  );
