INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
SELECT 'module_leads_events', 'Leads & Events', 'module', NULL, 155, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_definitions WHERE name = 'module_leads_events');

UPDATE public.permission_definitions SET is_active = true WHERE name = 'module_leads_events';

INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, 'module_leads_events', 'module', true, true, true, true, true, true
FROM public.security_profiles sp
WHERE NOT EXISTS (
  SELECT 1 FROM public.profile_object_permissions pop
  WHERE pop.profile_id = sp.id AND pop.object_name = 'module_leads_events'
);

UPDATE public.profile_object_permissions
SET can_read = true, can_create = true, can_edit = true, can_delete = true, can_view_all = true, can_modify_all = true
WHERE object_name = 'module_leads_events';