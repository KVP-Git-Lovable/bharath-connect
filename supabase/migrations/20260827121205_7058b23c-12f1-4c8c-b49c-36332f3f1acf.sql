-- 1) Restore inactive admin field definition present in the source project
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
VALUES ('field_admin_site_master', 'Project / Site Master', 'field', 'module_admin_panel', 6, false)
ON CONFLICT (name) DO NOTHING;

-- 2) Remove grants that do not exist in the source project
DELETE FROM public.profile_object_permissions p
USING public.security_profiles sp
WHERE sp.id = p.profile_id
  AND sp.name = 'Field Sales Executive'
  AND p.object_name IN ('module_customers', 'module_opportunities');

-- 3) Restore the legacy combined Leads & Events grant for every profile
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, 'module_leads_events', 'module', true, true, true, true, true, true
FROM public.security_profiles sp
ON CONFLICT (profile_id, object_name, permission_type) DO NOTHING;

-- 4) Align Leads / Events grants with the source project (copied from the combined module = all true)
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, m.name, 'module', true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN (VALUES ('module_leads'), ('module_events')) AS m(name)
ON CONFLICT (profile_id, object_name, permission_type) DO NOTHING;

UPDATE public.profile_object_permissions
SET can_read = true, can_create = true, can_edit = true,
    can_delete = true, can_view_all = true, can_modify_all = true
WHERE object_name IN ('module_leads', 'module_events', 'module_leads_events');