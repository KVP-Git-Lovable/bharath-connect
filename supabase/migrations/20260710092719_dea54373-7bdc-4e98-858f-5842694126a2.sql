
-- Split module_leads_events into module_leads and module_events
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
SELECT 'module_leads', 'Leads', 'module', NULL, COALESCE((SELECT sort_order FROM public.permission_definitions WHERE name='module_leads_events'), 100), true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_definitions WHERE name='module_leads');

INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active)
SELECT 'module_events', 'Events', 'module', NULL, COALESCE((SELECT sort_order FROM public.permission_definitions WHERE name='module_leads_events'), 100) + 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.permission_definitions WHERE name='module_events');

-- Copy profile grants from the combined module into both new modules
INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT profile_id, 'module_leads', permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all
FROM public.profile_object_permissions
WHERE object_name = 'module_leads_events'
ON CONFLICT DO NOTHING;

INSERT INTO public.profile_object_permissions (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT profile_id, 'module_events', permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all
FROM public.profile_object_permissions
WHERE object_name = 'module_leads_events'
ON CONFLICT DO NOTHING;

-- Deactivate the combined module so it no longer appears in permission UIs
UPDATE public.permission_definitions SET is_active = false WHERE name = 'module_leads_events';
