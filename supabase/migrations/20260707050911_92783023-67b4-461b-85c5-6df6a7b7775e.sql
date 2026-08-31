
-- 1) Deactivate the top-level Security module and its children (now part of Admin Panel)
UPDATE public.permission_definitions
SET is_active = false
WHERE name IN ('security', 'action_security_manage_profiles', 'action_security_assign_users');

-- 2) Add Admin Panel sub-permissions (as fields under module_admin_panel)
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active) VALUES
  ('field_admin_user_management', 'User Management', 'field', 'module_admin_panel', 17, true),
  ('field_admin_attendance_mgmt', 'Attendance Management', 'field', 'module_admin_panel', 18, true),
  ('field_admin_expense_mgmt', 'Expense Management', 'field', 'module_admin_panel', 19, true),
  ('field_admin_security_access', 'Security & Access', 'field', 'module_admin_panel', 20, true),
  ('field_admin_company_profile', 'Company Profile', 'field', 'module_admin_panel', 21, true)
ON CONFLICT (name) DO UPDATE
  SET label = EXCLUDED.label,
      type = EXCLUDED.type,
      parent_module = EXCLUDED.parent_module,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- 3) Add missing top-level modules
INSERT INTO public.permission_definitions (name, label, type, parent_module, sort_order, is_active) VALUES
  ('module_projects',    'Projects',    'module', NULL, 80,  true),
  ('module_sites',       'Sites',       'module', NULL, 90,  true),
  ('module_master_data', 'Master Data', 'module', NULL, 100, true),
  ('module_reports',     'Reports',     'module', NULL, 110, true),
  ('module_my_team',     'My Team',     'module', NULL, 120, true),
  ('module_vendors',     'Vendors',     'module', NULL, 130, true)
ON CONFLICT (name) DO UPDATE
  SET label = EXCLUDED.label,
      type = EXCLUDED.type,
      parent_module = EXCLUDED.parent_module,
      sort_order = EXCLUDED.sort_order,
      is_active = true;

-- 4) Seed Administrator profile with full permissions across ALL active definitions
INSERT INTO public.profile_object_permissions
  (profile_id, object_name, permission_type, can_read, can_create, can_edit, can_delete, can_view_all, can_modify_all)
SELECT sp.id, pd.name, pd.type, true, true, true, true, true, true
FROM public.security_profiles sp
CROSS JOIN public.permission_definitions pd
WHERE sp.name = 'Administrator'
  AND pd.is_active = true
ON CONFLICT (profile_id, object_name, permission_type) DO UPDATE
  SET can_read = true,
      can_create = true,
      can_edit = true,
      can_delete = true,
      can_view_all = true,
      can_modify_all = true;

-- 5) Remove any Administrator permission rows pointing at now-inactive objects
DELETE FROM public.profile_object_permissions pop
USING public.security_profiles sp
WHERE pop.profile_id = sp.id
  AND sp.name = 'Administrator'
  AND pop.object_name IN ('security', 'action_security_manage_profiles', 'action_security_assign_users');
